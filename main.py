from __future__ import annotations

import sys
from pathlib import Path
from tempfile import gettempdir

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from gpa_manager.db.connection import create_connection
from gpa_manager.db.schema import initialize_database
from gpa_manager.models.dto import CourseCreateCommand, PlanningTargetCreateCommand, ScenarioExpectationSaveCommand
from gpa_manager.models.enums import CourseStatus, ScenarioType, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.planning_scenario_repository import PlanningScenarioRepository
from gpa_manager.repositories.planning_target_repository import PlanningTargetRepository
from gpa_manager.repositories.scenario_course_expectation_repository import ScenarioCourseExpectationRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.school_rules import SchoolRuleEngine
from gpa_manager.services.course_service import CourseService
from gpa_manager.services.gpa_service import GpaCalculationService
from gpa_manager.services.planning_service import PlanningService
from gpa_manager.services.score_service import ScoreService


def main() -> None:
    demo_db = Path(gettempdir()) / "gpa_manager_demo.sqlite3"
    if demo_db.exists():
        demo_db.unlink()

    connection = create_connection(demo_db)
    initialize_database(connection)

    course_repository = CourseRepository(connection)
    score_repository = ScoreRepository(connection)
    planning_target_repository = PlanningTargetRepository(connection)
    planning_scenario_repository = PlanningScenarioRepository(connection)
    expectation_repository = ScenarioCourseExpectationRepository(connection)
    rule_engine = SchoolRuleEngine()

    course_service = CourseService(course_repository, score_repository, rule_engine)
    score_service = ScoreService(course_repository, score_repository, rule_engine)
    gpa_service = GpaCalculationService(course_repository, score_repository)
    planning_service = PlanningService(
        course_repository,
        planning_target_repository,
        planning_scenario_repository,
        expectation_repository,
        gpa_service,
        rule_engine,
    )

    calculus = course_service.create_course(
        CourseCreateCommand(
            name="高等数学",
            semester="2025秋",
            credit="4.0",
            status=CourseStatus.COMPLETED,
            score_type=ScoreType.PERCENTAGE,
            note="核心必修",
        )
    )
    english = course_service.create_course(
        CourseCreateCommand(
            name="大学英语",
            semester="2025秋",
            credit="2.0",
            status=CourseStatus.COMPLETED,
            score_type=ScoreType.GRADE,
        )
    )
    data_structure = course_service.create_course(
        CourseCreateCommand(
            name="数据结构",
            semester="2026春",
            credit="3.0",
            status=CourseStatus.PLANNED,
            score_type=ScoreType.PERCENTAGE,
        )
    )
    physics = course_service.create_course(
        CourseCreateCommand(
            name="大学物理",
            semester="2026春",
            credit="4.0",
            status=CourseStatus.PLANNED,
            score_type=ScoreType.PERCENTAGE,
        )
    )
    history = course_service.create_course(
        CourseCreateCommand(
            name="中国近现代史纲要",
            semester="2026春",
            credit="2.0",
            status=CourseStatus.PLANNED,
            score_type=ScoreType.GRADE,
        )
    )

    score_service.record_score(calculus.id, "92")
    score_service.record_score(english.id, "良好")

    print("课程列表")
    print("-" * 70)
    for item in course_service.list_courses():
        score_display = item.raw_score if item.has_score else "暂无成绩"
        grade_point_display = f"{item.grade_point:.3f}" if item.grade_point is not None else "-"
        print(
            f"{item.name:<12} | 学期: {item.semester:<11} | 学分: {item.credit:<6} | "
            f"状态: {item.status.label:<4} | 成绩: {score_display:<8} | 绩点: {grade_point_display}"
        )

    summary = gpa_service.calculate_current_gpa()
    print("\n当前 GPA 汇总")
    print("-" * 70)
    print(f"当前 GPA: {summary.current_gpa if summary.current_gpa is not None else 'N/A'}")
    print(f"已计入学分: {summary.counted_credit_sum}")
    print(f"已计入课程数: {summary.counted_course_count}")

    target_result = planning_service.create_target(PlanningTargetCreateCommand(target_gpa="3.60"))
    scenarios = {scenario.scenario_type: scenario for scenario in target_result.scenarios}

    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.OPTIMISTIC].scenario_id, data_structure.id, "95")
    )
    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.OPTIMISTIC].scenario_id, physics.id, "93")
    )
    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.OPTIMISTIC].scenario_id, history.id, "优")
    )

    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.NEUTRAL].scenario_id, data_structure.id, "88")
    )
    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.NEUTRAL].scenario_id, physics.id, "86")
    )
    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.NEUTRAL].scenario_id, history.id, "良好")
    )

    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.CONSERVATIVE].scenario_id, data_structure.id, "80")
    )
    planning_service.save_scenario_expectation(
        ScenarioExpectationSaveCommand(scenarios[ScenarioType.CONSERVATIVE].scenario_id, physics.id, "78")
    )

    target_result = planning_service.get_target_result(target_result.target_id)
    print("\n目标规划")
    print("-" * 70)
    print(f"目标 GPA: {target_result.target_gpa}")
    print(f"当前基线 GPA: {target_result.based_on_current_gpa}")
    print(f"未修总学分: {target_result.planned_credit_sum}")
    print(f"所需未来平均绩点: {target_result.required_future_average_gp}")
    print(f"分数解释: {target_result.required_score_text}")
    print(f"目标可达: {target_result.feasible}")
    if target_result.infeasible_reason:
        print(f"不可达原因: {target_result.infeasible_reason}")

    print("\n三种情景模拟")
    print("-" * 70)
    for scenario in target_result.scenarios:
        coverage_text = "完整模拟" if scenario.is_full_coverage else "部分模拟"
        print(
            f"{scenario.scenario_type.label:<4} | 最终 GPA: {scenario.simulated_final_gpa} | "
            f"覆盖学分: {scenario.covered_planned_credit} | {coverage_text}"
        )

    connection.close()


if __name__ == "__main__":
    main()

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
from gpa_manager.models.dto import CourseCreateCommand
from gpa_manager.models.enums import CourseStatus, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.school_rules import SchoolRuleEngine
from gpa_manager.services.course_service import CourseService
from gpa_manager.services.gpa_service import GpaCalculationService
from gpa_manager.services.score_service import ScoreService


def main() -> None:
    demo_db = Path(gettempdir()) / "gpa_manager_demo.sqlite3"
    if demo_db.exists():
        demo_db.unlink()

    connection = create_connection(demo_db)
    initialize_database(connection)

    course_repository = CourseRepository(connection)
    score_repository = ScoreRepository(connection)
    rule_engine = SchoolRuleEngine()

    course_service = CourseService(course_repository, score_repository, rule_engine)
    score_service = ScoreService(course_repository, score_repository, rule_engine)
    gpa_service = GpaCalculationService(course_repository, score_repository)

    calculus = course_service.create_course(
        CourseCreateCommand(
            name="高等数学",
            semester="2025-2026-1",
            credit="4.0",
            status=CourseStatus.COMPLETED,
            score_type=ScoreType.PERCENTAGE,
            note="核心必修",
        )
    )
    english = course_service.create_course(
        CourseCreateCommand(
            name="大学英语",
            semester="2025-2026-1",
            credit="2.0",
            status=CourseStatus.COMPLETED,
            score_type=ScoreType.GRADE,
        )
    )
    course_service.create_course(
        CourseCreateCommand(
            name="数据结构",
            semester="2025-2026-2",
            credit="3.0",
            status=CourseStatus.PLANNED,
            score_type=ScoreType.PERCENTAGE,
        )
    )

    score_service.record_score(calculus.id, "92")
    score_service.record_score(english.id, "良好")

    print("课程列表")
    print("-" * 60)
    for item in course_service.list_courses():
        score_display = item.raw_score if item.has_score else "暂无成绩"
        grade_point_display = f"{item.grade_point:.3f}" if item.grade_point is not None else "-"
        print(
            f"{item.name:<10} | 学期: {item.semester:<11} | 学分: {item.credit:<4} | "
            f"状态: {item.status.label:<4} | 成绩: {score_display:<8} | 绩点: {grade_point_display}"
        )

    summary = gpa_service.calculate_current_gpa()
    print("\nGPA 汇总")
    print("-" * 60)
    print(f"当前 GPA: {summary.current_gpa if summary.current_gpa is not None else 'N/A'}")
    print(f"已计入学分: {summary.counted_credit_sum}")
    print(f"已计入课程数: {summary.counted_course_count}")
    print("明细:")
    for item in summary.items:
        print(
            f"  - {item.course_name}: 成绩={item.raw_score}, 绩点={item.grade_point}, "
            f"学分={item.credit}, 质量点={item.quality_points}"
        )

    connection.close()


if __name__ == "__main__":
    main()

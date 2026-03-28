from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from gpa_manager.common.decimal_utils import quantize_display, quantize_storage, to_decimal
from gpa_manager.common.exceptions import NotFoundError, ValidationError
from gpa_manager.common.utils import new_id, utc_now
from gpa_manager.models.dto import (
    PlanningScenarioResult,
    PlanningTargetCreateCommand,
    PlanningTargetResult,
    ScenarioExpectationSaveCommand,
)
from gpa_manager.models.entities import PlanningScenario, PlanningTarget, ScenarioCourseExpectation
from gpa_manager.models.enums import CourseStatus, ScenarioType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.planning_scenario_repository import PlanningScenarioRepository
from gpa_manager.repositories.planning_target_repository import PlanningTargetRepository
from gpa_manager.repositories.scenario_course_expectation_repository import ScenarioCourseExpectationRepository
from gpa_manager.rules.base import RuleEngine
from gpa_manager.services.gpa_service import GpaCalculationService


@dataclass(slots=True)
class _PlanningBaseline:
    current_gpa: Decimal
    completed_credit_sum: Decimal
    quality_point_sum: Decimal
    planned_credit_sum: Decimal
    planned_courses: dict[str, object]


class PlanningService:
    def __init__(
        self,
        course_repository: CourseRepository,
        planning_target_repository: PlanningTargetRepository,
        planning_scenario_repository: PlanningScenarioRepository,
        expectation_repository: ScenarioCourseExpectationRepository,
        gpa_service: GpaCalculationService,
        rule_engine: RuleEngine,
    ) -> None:
        self._course_repository = course_repository
        self._planning_target_repository = planning_target_repository
        self._planning_scenario_repository = planning_scenario_repository
        self._expectation_repository = expectation_repository
        self._gpa_service = gpa_service
        self._rule_engine = rule_engine

    def create_target(self, command: PlanningTargetCreateCommand) -> PlanningTargetResult:
        target_gpa = to_decimal(command.target_gpa)
        if target_gpa < 0 or target_gpa > 4:
            raise ValidationError("目标 GPA 必须在 0 到 4 之间。")

        baseline = self._build_baseline()
        required_gp, feasible, infeasible_reason = self._calculate_required_future_average(target_gpa, baseline)

        now = utc_now()
        target = PlanningTarget(
            id=new_id(),
            target_gpa=quantize_display(target_gpa),
            based_on_current_gpa=baseline.current_gpa,
            based_on_completed_credit_sum=baseline.completed_credit_sum,
            feasible=feasible,
            infeasible_reason=infeasible_reason,
            created_at=now,
        )
        self._planning_target_repository.add(target)

        for scenario_type in ScenarioType:
            self._planning_scenario_repository.add(
                PlanningScenario(
                    id=new_id(),
                    target_id=target.id,
                    scenario_type=scenario_type,
                    simulated_final_gpa=None,
                    required_future_average_gp=required_gp,
                    created_at=now,
                )
            )

        return self.get_target_result(target.id)

    def save_scenario_expectation(self, command: ScenarioExpectationSaveCommand) -> ScenarioCourseExpectation:
        scenario = self._planning_scenario_repository.get(command.scenario_id)
        if scenario is None:
            raise NotFoundError("规划情景不存在。")

        course = self._course_repository.get(command.course_id)
        if course is None:
            raise NotFoundError("课程不存在。")
        if course.status is not CourseStatus.PLANNED:
            raise ValidationError("只能为未修课程设置规划预期成绩。")

        resolved_score_type = command.score_type or course.score_type
        if resolved_score_type is None:
            raise ValidationError("未修课程的预期成绩必须明确成绩类型。")

        expected_grade_point = quantize_storage(
            self._rule_engine.convert_to_grade_point(resolved_score_type, command.raw_score)
        )
        existing = self._expectation_repository.get_by_scenario_and_course(command.scenario_id, command.course_id)
        now = utc_now()

        expectation = ScenarioCourseExpectation(
            id=existing.id if existing else new_id(),
            scenario_id=command.scenario_id,
            course_id=command.course_id,
            expected_score_raw=command.raw_score.strip(),
            expected_grade_point=expected_grade_point,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        self._expectation_repository.upsert(expectation)
        return expectation

    def get_target_result(self, target_id: str) -> PlanningTargetResult:
        target = self._planning_target_repository.get(target_id)
        if target is None:
            raise NotFoundError("规划目标不存在。")

        baseline = self._build_baseline()
        scenarios = self._planning_scenario_repository.list_by_target_id(target_id)
        scenario_results = [self._calculate_scenario_result(scenario, baseline) for scenario in scenarios]
        required_gp = scenarios[0].required_future_average_gp if scenarios else None

        return PlanningTargetResult(
            target_id=target.id,
            target_gpa=target.target_gpa,
            based_on_current_gpa=target.based_on_current_gpa,
            based_on_completed_credit_sum=target.based_on_completed_credit_sum,
            planned_credit_sum=baseline.planned_credit_sum,
            required_future_average_gp=required_gp,
            required_score_text=self._describe_required_score(required_gp),
            feasible=target.feasible,
            infeasible_reason=target.infeasible_reason,
            scenarios=scenario_results,
        )

    def _calculate_scenario_result(
        self,
        scenario: PlanningScenario,
        baseline: _PlanningBaseline,
    ) -> PlanningScenarioResult:
        expectations = self._expectation_repository.list_by_scenario_id(scenario.id)
        planned_courses = baseline.planned_courses

        covered_planned_credit = Decimal("0")
        expected_quality_point_sum = Decimal("0")
        covered_course_ids: set[str] = set()

        for expectation in expectations:
            course = planned_courses.get(expectation.course_id)
            if course is None or expectation.expected_grade_point is None:
                continue
            covered_course_ids.add(expectation.course_id)
            covered_planned_credit += course.credit
            expected_quality_point_sum += course.credit * expectation.expected_grade_point

        covered_planned_credit = quantize_storage(covered_planned_credit)
        expected_quality_point_sum = quantize_storage(expected_quality_point_sum)

        simulated_final_gpa = None
        total_credit = baseline.completed_credit_sum + covered_planned_credit
        if total_credit != 0:
            simulated_final_gpa = quantize_display(
                (baseline.quality_point_sum + expected_quality_point_sum) / total_credit
            )

        updated_scenario = PlanningScenario(
            id=scenario.id,
            target_id=scenario.target_id,
            scenario_type=scenario.scenario_type,
            simulated_final_gpa=simulated_final_gpa,
            required_future_average_gp=scenario.required_future_average_gp,
            created_at=scenario.created_at,
        )
        self._planning_scenario_repository.update(updated_scenario)

        return PlanningScenarioResult(
            scenario_id=scenario.id,
            scenario_type=scenario.scenario_type,
            simulated_final_gpa=simulated_final_gpa,
            required_future_average_gp=scenario.required_future_average_gp,
            covered_planned_credit=covered_planned_credit,
            is_full_coverage=len(covered_course_ids) == len(planned_courses),
            expectation_count=len(covered_course_ids),
        )

    def _build_baseline(self) -> _PlanningBaseline:
        summary = self._gpa_service.calculate_current_gpa()
        planned_courses = {
            course.id: course
            for course in self._course_repository.list_all()
            if course.status is CourseStatus.PLANNED
        }
        planned_credit_sum = quantize_storage(sum((course.credit for course in planned_courses.values()), Decimal("0")))
        return _PlanningBaseline(
            current_gpa=summary.current_gpa or Decimal("0.000"),
            completed_credit_sum=summary.counted_credit_sum,
            quality_point_sum=summary.quality_point_sum,
            planned_credit_sum=planned_credit_sum,
            planned_courses=planned_courses,
        )

    @staticmethod
    def _calculate_required_future_average(
        target_gpa: Decimal,
        baseline: _PlanningBaseline,
    ) -> tuple[Decimal | None, bool, str | None]:
        if baseline.planned_credit_sum == 0:
            if baseline.completed_credit_sum != 0 and baseline.current_gpa >= quantize_display(target_gpa):
                return Decimal("0.000"), True, "当前 GPA 已达到目标，且没有剩余未修课程。"
            return None, False, "没有剩余未修课程，无法继续通过规划提升 GPA。"

        required_gp = (
            target_gpa * (baseline.completed_credit_sum + baseline.planned_credit_sum) - baseline.quality_point_sum
        ) / baseline.planned_credit_sum
        required_gp = quantize_display(required_gp)

        if required_gp <= 0:
            return Decimal("0.000"), True, "当前 GPA 已达到或超过目标。"
        if required_gp > Decimal("4.000"):
            return required_gp, False, "按当前规则，剩余课程平均绩点需要超过 4.0，目标不可达。"
        return required_gp, True, None

    def _describe_required_score(self, required_gp: Decimal | None) -> str:
        if required_gp is None:
            return "没有可用于规划的未修课程，因此无法倒推未来平均分。"
        if required_gp <= 0:
            return "当前 GPA 已达到目标，不再要求未修课程提供额外平均绩点。"
        if required_gp > Decimal("4.000"):
            return "目标不可达：按现行规则，未来课程平均绩点无法超过 4.0。"

        percentage_text = self._minimum_percentage_text(required_gp)
        grade_text = self._minimum_grade_text(required_gp)
        return f"若按百分制估算，剩余课程平均至少约需 {percentage_text}；若按等级制估算，至少需达到 {grade_text}。"

    @staticmethod
    def _minimum_percentage_text(required_gp: Decimal) -> str:
        if required_gp <= Decimal("1.000"):
            return "60 分"
        if required_gp >= Decimal("4.000"):
            return "100 分"

        gap = (Decimal("4") - required_gp) * Decimal("1600") / Decimal("3")
        root = gap.sqrt()
        minimum_score = quantize_display(Decimal("100") - root)
        return f"{minimum_score} 分"

    @staticmethod
    def _minimum_grade_text(required_gp: Decimal) -> str:
        if required_gp <= Decimal("1.700"):
            return "及格（1.7）"
        if required_gp <= Decimal("2.800"):
            return "中等（2.8）"
        if required_gp <= Decimal("3.500"):
            return "良好（3.5）"
        return "优（4.0）"

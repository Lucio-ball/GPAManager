from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from gpa_manager.common.exceptions import ValidationError
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


class PlanningServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        connection = create_connection(":memory:")
        initialize_database(connection)

        self.connection = connection
        self.course_repository = CourseRepository(connection)
        self.score_repository = ScoreRepository(connection)
        self.planning_target_repository = PlanningTargetRepository(connection)
        self.planning_scenario_repository = PlanningScenarioRepository(connection)
        self.expectation_repository = ScenarioCourseExpectationRepository(connection)
        self.rule_engine = SchoolRuleEngine()
        self.course_service = CourseService(self.course_repository, self.score_repository, self.rule_engine)
        self.score_service = ScoreService(self.course_repository, self.score_repository, self.rule_engine)
        self.gpa_service = GpaCalculationService(self.course_repository, self.score_repository)
        self.planning_service = PlanningService(
            self.course_repository,
            self.planning_target_repository,
            self.planning_scenario_repository,
            self.expectation_repository,
            self.gpa_service,
            self.rule_engine,
        )

    def tearDown(self) -> None:
        self.connection.close()

    def test_target_gpa_backtracking_runs_through(self) -> None:
        self._seed_completed_and_planned_courses()

        result = self.planning_service.create_target(PlanningTargetCreateCommand(target_gpa="3.500"))

        self.assertEqual(result.required_future_average_gp, Decimal("3.283"))
        self.assertTrue(result.feasible)
        self.assertEqual(result.planned_credit_sum, Decimal("7.0000"))
        self.assertIn("百分制", result.required_score_text)
        self.assertEqual(len(result.scenarios), 3)

    def test_three_scenarios_return_results(self) -> None:
        planned_courses = self._seed_completed_and_planned_courses()
        result = self.planning_service.create_target(PlanningTargetCreateCommand(target_gpa="3.400"))
        scenario_map = {scenario.scenario_type: scenario for scenario in result.scenarios}

        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(scenario_map[ScenarioType.OPTIMISTIC].scenario_id, planned_courses[0], "95")
        )
        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(scenario_map[ScenarioType.OPTIMISTIC].scenario_id, planned_courses[1], "优")
        )
        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(scenario_map[ScenarioType.NEUTRAL].scenario_id, planned_courses[0], "85")
        )
        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(scenario_map[ScenarioType.NEUTRAL].scenario_id, planned_courses[1], "良好")
        )
        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(scenario_map[ScenarioType.CONSERVATIVE].scenario_id, planned_courses[0], "75")
        )

        refreshed = self.planning_service.get_target_result(result.target_id)
        refreshed_map = {scenario.scenario_type: scenario for scenario in refreshed.scenarios}

        self.assertEqual(refreshed_map[ScenarioType.OPTIMISTIC].simulated_final_gpa, Decimal("3.875"))
        self.assertEqual(refreshed_map[ScenarioType.NEUTRAL].simulated_final_gpa, Decimal("3.635"))
        self.assertEqual(refreshed_map[ScenarioType.CONSERVATIVE].simulated_final_gpa, Decimal("3.445"))
        self.assertTrue(refreshed_map[ScenarioType.OPTIMISTIC].is_full_coverage)
        self.assertFalse(refreshed_map[ScenarioType.CONSERVATIVE].is_full_coverage)

    def test_planning_data_does_not_pollute_real_scores(self) -> None:
        planned_courses = self._seed_completed_and_planned_courses()
        baseline = self.gpa_service.calculate_current_gpa()
        result = self.planning_service.create_target(PlanningTargetCreateCommand(target_gpa="3.400"))

        optimistic = next(s for s in result.scenarios if s.scenario_type is ScenarioType.OPTIMISTIC)
        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(optimistic.scenario_id, planned_courses[0], "100")
        )

        after_planning = self.gpa_service.calculate_current_gpa()
        stored_real_score = self.score_repository.get_by_course_id(planned_courses[0])

        self.assertEqual(after_planning.current_gpa, baseline.current_gpa)
        self.assertEqual(after_planning.counted_credit_sum, baseline.counted_credit_sum)
        self.assertIsNone(stored_real_score)

    def test_only_planned_course_credits_participate_and_completed_credits_not_duplicated(self) -> None:
        planned_courses = self._seed_completed_and_planned_courses()
        result = self.planning_service.create_target(PlanningTargetCreateCommand(target_gpa="3.400"))
        optimistic = next(s for s in result.scenarios if s.scenario_type is ScenarioType.OPTIMISTIC)

        self.planning_service.save_scenario_expectation(
            ScenarioExpectationSaveCommand(optimistic.scenario_id, planned_courses[0], "90")
        )

        refreshed = self.planning_service.get_target_result(result.target_id)
        refreshed_optimistic = next(s for s in refreshed.scenarios if s.scenario_type is ScenarioType.OPTIMISTIC)

        self.assertEqual(refreshed_optimistic.covered_planned_credit, Decimal("3.0000"))
        self.assertFalse(refreshed_optimistic.is_full_coverage)
        self.assertEqual(self.gpa_service.calculate_current_gpa().counted_credit_sum, Decimal("6.0000"))

    def test_invalid_or_unreachable_targets_and_partial_coverage_are_handled(self) -> None:
        self._seed_completed_and_planned_courses()

        with self.assertRaises(ValidationError):
            self.planning_service.create_target(PlanningTargetCreateCommand(target_gpa="4.100"))

        unreachable = self.planning_service.create_target(PlanningTargetCreateCommand(target_gpa="3.950"))
        conservative = next(s for s in unreachable.scenarios if s.scenario_type is ScenarioType.CONSERVATIVE)
        unreachable_result = self.planning_service.get_target_result(unreachable.target_id)
        conservative_result = next(s for s in unreachable_result.scenarios if s.scenario_type is ScenarioType.CONSERVATIVE)

        self.assertFalse(unreachable_result.feasible)
        self.assertIsNotNone(unreachable_result.infeasible_reason)
        self.assertGreater(unreachable_result.required_future_average_gp, Decimal("4.000"))
        self.assertFalse(conservative_result.is_full_coverage)
        self.assertEqual(conservative.covered_planned_credit, Decimal("0.0000"))

    def test_invalid_semester_format_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            self.course_service.create_course(
                CourseCreateCommand(
                    name="Invalid Semester",
                    semester="2025-2026-1",
                    credit="2.0",
                    status=CourseStatus.PLANNED,
                    score_type=ScoreType.PERCENTAGE,
                )
            )

    def _seed_completed_and_planned_courses(self) -> list[str]:
        completed_math = self.course_service.create_course(
            CourseCreateCommand(
                name="Advanced Math",
                semester="2025秋",
                credit="4.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        completed_english = self.course_service.create_course(
            CourseCreateCommand(
                name="English",
                semester="2025秋",
                credit="2.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.GRADE,
            )
        )
        planned_algorithm = self.course_service.create_course(
            CourseCreateCommand(
                name="Algorithms",
                semester="2026春",
                credit="3.0",
                status=CourseStatus.PLANNED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        planned_history = self.course_service.create_course(
            CourseCreateCommand(
                name="History",
                semester="2026春",
                credit="4.0",
                status=CourseStatus.PLANNED,
                score_type=ScoreType.GRADE,
            )
        )

        self.score_service.record_score(completed_math.id, "92")
        self.score_service.record_score(completed_english.id, "良好")

        return [planned_algorithm.id, planned_history.id]


if __name__ == "__main__":
    unittest.main()

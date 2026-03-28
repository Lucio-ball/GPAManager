from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from gpa_manager.common.decimal_utils import quantize_display
from gpa_manager.db.connection import create_connection
from gpa_manager.db.schema import initialize_database
from gpa_manager.models.dto import CourseCreateCommand
from gpa_manager.models.enums import CourseStatus, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.school_rules import SchoolRuleEngine
from gpa_manager.services.course_service import CourseService
from gpa_manager.services.gpa_service import GpaCalculationService
from gpa_manager.services.import_service import ImportService
from gpa_manager.services.score_service import ScoreService


class ImportServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        connection = create_connection(":memory:")
        initialize_database(connection)

        self.connection = connection
        self.course_repository = CourseRepository(connection)
        self.score_repository = ScoreRepository(connection)
        self.rule_engine = SchoolRuleEngine()
        self.course_service = CourseService(self.course_repository, self.score_repository, self.rule_engine)
        self.score_service = ScoreService(self.course_repository, self.score_repository, self.rule_engine)
        self.gpa_service = GpaCalculationService(self.course_repository, self.score_repository)
        self.import_service = ImportService(
            connection=connection,
            course_repository=self.course_repository,
            score_repository=self.score_repository,
            course_service=self.course_service,
            score_service=self.score_service,
            rule_engine=self.rule_engine,
        )

    def tearDown(self) -> None:
        self.connection.close()

    def test_valid_course_import_runs_through(self) -> None:
        report = self._run_course_import(
            """
            course_name=Advanced Math;semester=2025秋;credit=4.0;status=COMPLETED;score_type=PERCENTAGE;note=core
            course_name=Algorithms;semester=2026春;credit=3.0;status=PLANNED;score_type=PERCENTAGE
            """
        )

        self.assertTrue(report.applied)
        self.assertEqual(report.success_count, 2)
        self.assertEqual(report.failure_count, 0)
        self.assertEqual(report.skipped_count, 0)
        self.assertEqual(len(self.course_service.list_courses()), 2)

        completed_course = self.course_repository.find_by_name_and_semester("Advanced Math", "2025秋")
        self.assertIsNotNone(completed_course)
        self.assertFalse(self.score_repository.get_by_course_id(completed_course.id).has_score)

    def test_valid_score_import_updates_gpa_summary(self) -> None:
        self._run_course_import(
            """
            course_name=Advanced Math;semester=2025秋;credit=4.0;status=COMPLETED;score_type=PERCENTAGE
            course_name=English;semester=2025秋;credit=2.0;status=COMPLETED;score_type=PERCENTAGE
            """
        )

        report = self._run_score_import(
            """
            course_name=Advanced Math;semester=2025秋;raw_score=92
            course_name=English;semester=2025秋;raw_score=88
            """
        )

        advanced_math_gp = self.rule_engine.convert_to_grade_point(ScoreType.PERCENTAGE, "92")
        english_gp = self.rule_engine.convert_to_grade_point(ScoreType.PERCENTAGE, "88")
        expected_gpa = quantize_display((advanced_math_gp * Decimal("4.0") + english_gp * Decimal("2.0")) / Decimal("6.0"))
        summary = self.gpa_service.calculate_current_gpa()

        self.assertTrue(report.applied)
        self.assertEqual(report.success_count, 2)
        self.assertEqual(summary.current_gpa, expected_gpa)
        self.assertEqual(summary.counted_course_count, 2)
        self.assertEqual(summary.counted_credit_sum, Decimal("6.0000"))

    def test_invalid_course_fields_are_blocked(self) -> None:
        report = self._run_course_import(
            """
            course_name=;semester=2025秋;credit=-1;status=COMPLETED
            """
        )

        self.assertFalse(report.applied)
        self.assertEqual(report.success_count, 0)
        self.assertGreaterEqual(report.failure_count, 1)
        self.assertEqual(len(self.course_service.list_courses()), 0)

    def test_duplicate_course_import_is_skipped(self) -> None:
        self.course_service.create_course(
            CourseCreateCommand(
                name="Advanced Math",
                semester="2025秋",
                credit="4.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
                note="core",
            )
        )

        report = self._run_course_import(
            """
            course_name=Advanced Math;semester=2025秋;credit=4.0;status=COMPLETED;score_type=PERCENTAGE;note=core
            """
        )

        self.assertTrue(report.applied)
        self.assertEqual(report.success_count, 0)
        self.assertEqual(report.skipped_count, 1)
        self.assertEqual(report.failure_count, 0)
        self.assertEqual(len(self.course_service.list_courses()), 1)

    def test_score_import_rejects_missing_course_and_planned_course(self) -> None:
        self.course_service.create_course(
            CourseCreateCommand(
                name="Algorithms",
                semester="2026春",
                credit="3.0",
                status=CourseStatus.PLANNED,
                score_type=ScoreType.PERCENTAGE,
            )
        )

        report = self._run_score_import(
            """
            course_name=Missing Course;semester=2025秋;raw_score=90;score_type=PERCENTAGE
            course_name=Algorithms;semester=2026春;raw_score=91
            """
        )

        self.assertFalse(report.applied)
        self.assertEqual(report.success_count, 0)
        self.assertEqual(report.failure_count, 2)
        self.assertEqual(self.gpa_service.calculate_current_gpa().counted_course_count, 0)

    def test_score_conflict_is_rejected_without_overwriting_existing_score(self) -> None:
        course = self.course_service.create_course(
            CourseCreateCommand(
                name="Advanced Math",
                semester="2025秋",
                credit="4.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        self.score_service.record_score(course.id, "92")
        baseline_gpa = self.gpa_service.calculate_current_gpa().current_gpa

        report = self._run_score_import(
            """
            course_name=Advanced Math;semester=2025秋;raw_score=95
            """
        )

        stored_score = self.score_repository.get_by_course_id(course.id)

        self.assertFalse(report.applied)
        self.assertEqual(report.failure_count, 1)
        self.assertEqual(stored_score.raw_score, "92")
        self.assertEqual(self.gpa_service.calculate_current_gpa().current_gpa, baseline_gpa)

    def test_failed_batch_does_not_persist_partial_course_data(self) -> None:
        self.course_service.create_course(
            CourseCreateCommand(
                name="Existing Course",
                semester="2025秋",
                credit="2.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )

        report = self._run_course_import(
            """
            course_name=New Course;semester=2026春;credit=3.0;status=PLANNED;score_type=PERCENTAGE
            course_name=Existing Course;semester=2025秋;credit=5.0;status=COMPLETED;score_type=PERCENTAGE
            """
        )

        self.assertFalse(report.applied)
        self.assertEqual(report.success_count, 0)
        self.assertEqual(report.failure_count, 1)
        self.assertIsNone(self.course_repository.find_by_name_and_semester("New Course", "2026春"))
        self.assertIsNotNone(self.course_repository.find_by_name_and_semester("Existing Course", "2025秋"))
        self.assertEqual(len(self.course_service.list_courses()), 1)

    def _run_course_import(self, text: str):
        parsed = self.import_service.parse_course_import_text(text)
        validated = self.import_service.validate_course_import_data(parsed)
        return self.import_service.import_courses(validated)

    def _run_score_import(self, text: str):
        parsed = self.import_service.parse_score_import_text(text)
        validated = self.import_service.validate_score_import_data(parsed)
        return self.import_service.import_scores(validated)


if __name__ == "__main__":
    unittest.main()

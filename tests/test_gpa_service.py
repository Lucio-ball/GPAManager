from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

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


class GpaCalculationServiceTests(unittest.TestCase):
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

    def tearDown(self) -> None:
        self.connection.close()

    def test_gpa_is_weighted_by_credit(self) -> None:
        calculus = self.course_service.create_course(
            CourseCreateCommand(
                name="高等数学",
                semester="2025-2026-1",
                credit="4.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        english = self.course_service.create_course(
            CourseCreateCommand(
                name="大学英语",
                semester="2025-2026-1",
                credit="2.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.GRADE,
            )
        )

        self.score_service.record_score(calculus.id, "92")
        self.score_service.record_score(english.id, "良好")

        summary = self.gpa_service.calculate_current_gpa()

        self.assertEqual(summary.current_gpa, Decimal("3.753"))
        self.assertEqual(summary.counted_credit_sum, Decimal("6.0000"))
        self.assertEqual(summary.counted_course_count, 2)
        self.assertEqual(summary.quality_point_sum, Decimal("22.5200"))

    def test_planned_courses_are_excluded_from_gpa(self) -> None:
        completed = self.course_service.create_course(
            CourseCreateCommand(
                name="线性代数",
                semester="2025-2026-1",
                credit="3.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        self.course_service.create_course(
            CourseCreateCommand(
                name="离散数学",
                semester="2025-2026-2",
                credit="3.0",
                status=CourseStatus.PLANNED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        self.score_service.record_score(completed.id, "90")

        summary = self.gpa_service.calculate_current_gpa()

        self.assertEqual(summary.counted_course_count, 1)
        self.assertEqual(summary.counted_credit_sum, Decimal("3.0000"))
        self.assertEqual(summary.current_gpa, Decimal("3.813"))

    def test_completed_course_without_score_is_excluded_from_gpa(self) -> None:
        self.course_service.create_course(
            CourseCreateCommand(
                name="概率论",
                semester="2025-2026-1",
                credit="3.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )

        summary = self.gpa_service.calculate_current_gpa()

        self.assertIsNone(summary.current_gpa)
        self.assertEqual(summary.counted_course_count, 0)
        self.assertEqual(summary.counted_credit_sum, Decimal("0.0000"))

    def test_cleared_score_is_excluded_from_gpa(self) -> None:
        course = self.course_service.create_course(
            CourseCreateCommand(
                name="大学物理",
                semester="2025-2026-1",
                credit="4.0",
                status=CourseStatus.COMPLETED,
                score_type=ScoreType.PERCENTAGE,
            )
        )
        self.score_service.record_score(course.id, "88")
        self.score_service.clear_score(course.id)

        summary = self.gpa_service.calculate_current_gpa()

        self.assertIsNone(summary.current_gpa)
        self.assertEqual(summary.counted_course_count, 0)
        self.assertEqual(summary.counted_credit_sum, Decimal("0.0000"))


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

from decimal import Decimal

from gpa_manager.common.decimal_utils import quantize_display, quantize_storage
from gpa_manager.models.dto import CourseGpaItem, GpaSummary
from gpa_manager.models.enums import CourseStatus
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository


class GpaCalculationService:
    def __init__(self, course_repository: CourseRepository, score_repository: ScoreRepository) -> None:
        self._course_repository = course_repository
        self._score_repository = score_repository

    def calculate_current_gpa(self) -> GpaSummary:
        courses = self._course_repository.list_all()
        score_map = self._score_repository.list_by_course_ids([course.id for course in courses])

        items: list[CourseGpaItem] = []
        counted_credit_sum = Decimal("0")
        quality_point_sum = Decimal("0")

        for course in courses:
            if course.status is not CourseStatus.COMPLETED:
                continue
            score_record = score_map.get(course.id)
            if score_record is None or not score_record.has_score or score_record.grade_point is None:
                continue
            if course.score_type is None or score_record.raw_score is None:
                continue

            quality_points = quantize_storage(course.credit * score_record.grade_point)
            counted_credit_sum += course.credit
            quality_point_sum += quality_points
            items.append(
                CourseGpaItem(
                    course_id=course.id,
                    course_name=course.name,
                    semester=course.semester,
                    credit=course.credit,
                    score_type=course.score_type,
                    raw_score=score_record.raw_score,
                    grade_point=score_record.grade_point,
                    quality_points=quality_points,
                )
            )

        counted_credit_sum = quantize_storage(counted_credit_sum)
        quality_point_sum = quantize_storage(quality_point_sum)

        current_gpa = None
        if counted_credit_sum != 0:
            current_gpa = quantize_display(quality_point_sum / counted_credit_sum)

        return GpaSummary(
            current_gpa=current_gpa,
            counted_credit_sum=counted_credit_sum,
            counted_course_count=len(items),
            quality_point_sum=quality_point_sum,
            items=items,
        )

from __future__ import annotations

from gpa_manager.common.decimal_utils import quantize_storage
from gpa_manager.common.exceptions import NotFoundError, ValidationError
from gpa_manager.common.utils import utc_now
from gpa_manager.models.entities import ScoreRecord
from gpa_manager.models.enums import CourseStatus, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.base import RuleEngine


class ScoreService:
    def __init__(
        self,
        course_repository: CourseRepository,
        score_repository: ScoreRepository,
        rule_engine: RuleEngine,
    ) -> None:
        self._course_repository = course_repository
        self._score_repository = score_repository
        self._rule_engine = rule_engine

    def record_score(self, course_id: str, raw_score: str, score_type: ScoreType | None = None) -> ScoreRecord:
        course = self._course_repository.get(course_id)
        if course is None:
            raise NotFoundError("课程不存在。")
        if course.status is not CourseStatus.COMPLETED:
            raise ValidationError("未修课程不能录入真实成绩。")

        resolved_score_type = score_type or course.score_type
        if resolved_score_type is None:
            raise ValidationError("录入成绩前必须明确课程的成绩类型。")

        grade_point = self._rule_engine.convert_to_grade_point(resolved_score_type, raw_score)
        now = utc_now()

        if course.score_type != resolved_score_type:
            course.score_type = resolved_score_type
            course.updated_at = now
            self._course_repository.update(course)

        score_record = ScoreRecord(
            course_id=course_id,
            has_score=True,
            raw_score=raw_score.strip(),
            grade_point=quantize_storage(grade_point),
            calculated_by_rule=self._rule_engine.rule_id,
            updated_at=now,
        )
        self._score_repository.upsert(score_record)
        return score_record

    def clear_score(self, course_id: str) -> ScoreRecord:
        course = self._course_repository.get(course_id)
        if course is None:
            raise NotFoundError("课程不存在。")
        if course.status is not CourseStatus.COMPLETED:
            raise ValidationError("未修课程不存在可清空的真实成绩。")

        score_record = ScoreRecord(
            course_id=course_id,
            has_score=False,
            raw_score=None,
            grade_point=None,
            calculated_by_rule=None,
            updated_at=utc_now(),
        )
        self._score_repository.upsert(score_record)
        return score_record

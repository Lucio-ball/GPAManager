from __future__ import annotations

import re
import sqlite3
from decimal import Decimal

from gpa_manager.common.decimal_utils import quantize_storage, to_decimal
from gpa_manager.common.exceptions import DuplicateCourseError, NotFoundError, ValidationError
from gpa_manager.common.utils import new_id, utc_now
from gpa_manager.models.dto import CourseCreateCommand, CourseUpdateCommand, CourseView
from gpa_manager.models.entities import Course, ScoreRecord
from gpa_manager.models.enums import CourseStatus
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.base import RuleEngine


class CourseService:
    _SEMESTER_PATTERN = re.compile(r"^\d{4}(春|夏|秋|冬)$")

    def __init__(
        self,
        course_repository: CourseRepository,
        score_repository: ScoreRepository,
        rule_engine: RuleEngine,
    ) -> None:
        self._course_repository = course_repository
        self._score_repository = score_repository
        self._rule_engine = rule_engine

    def create_course(self, command: CourseCreateCommand) -> Course:
        validated_credit = self._validate_credit(command.credit)
        self._validate_course_identity(command.name, command.semester)

        existing_course = self._course_repository.find_by_name_and_semester(command.name.strip(), command.semester.strip())
        if existing_course:
            raise DuplicateCourseError("同一学期下已存在同名课程。")

        now = utc_now()
        course = Course(
            id=new_id(),
            name=command.name.strip(),
            semester=command.semester.strip(),
            credit=validated_credit,
            status=command.status,
            score_type=command.score_type,
            note=self._normalize_optional_text(command.note),
            created_at=now,
            updated_at=now,
        )

        try:
            self._course_repository.add(course)
        except sqlite3.IntegrityError as exc:
            raise DuplicateCourseError("同一学期下已存在同名课程。") from exc

        if course.status is CourseStatus.COMPLETED:
            self._score_repository.upsert(
                ScoreRecord(
                    course_id=course.id,
                    has_score=False,
                    raw_score=None,
                    grade_point=None,
                    calculated_by_rule=None,
                    updated_at=now,
                )
            )
        return course

    def update_course(self, course_id: str, command: CourseUpdateCommand) -> Course:
        course = self._course_repository.get(course_id)
        if course is None:
            raise NotFoundError("课程不存在。")

        validated_credit = self._validate_credit(command.credit)
        self._validate_course_identity(command.name, command.semester)

        conflict = self._course_repository.find_by_name_and_semester(command.name.strip(), command.semester.strip())
        if conflict and conflict.id != course_id:
            raise DuplicateCourseError("同一学期下已存在同名课程。")

        existing_score = self._score_repository.get_by_course_id(course_id)
        if command.status is CourseStatus.PLANNED and existing_score and existing_score.has_score:
            raise ValidationError("未修课程不能保留已录入成绩，请先清空成绩。")
        if command.status is CourseStatus.COMPLETED and existing_score and existing_score.has_score and command.score_type is None:
            raise ValidationError("已录入成绩的课程必须保留成绩类型。")

        updated_course = Course(
            id=course.id,
            name=command.name.strip(),
            semester=command.semester.strip(),
            credit=validated_credit,
            status=command.status,
            score_type=command.score_type,
            note=self._normalize_optional_text(command.note),
            created_at=course.created_at,
            updated_at=utc_now(),
        )
        self._course_repository.update(updated_course)

        if updated_course.status is CourseStatus.COMPLETED:
            if existing_score is None:
                self._score_repository.upsert(
                    ScoreRecord(
                        course_id=course_id,
                        has_score=False,
                        raw_score=None,
                        grade_point=None,
                        calculated_by_rule=None,
                        updated_at=updated_course.updated_at,
                    )
                )
            elif existing_score.has_score and updated_course.score_type:
                recalculated_grade_point = self._rule_engine.convert_to_grade_point(
                    updated_course.score_type,
                    existing_score.raw_score or "",
                )
                self._score_repository.upsert(
                    ScoreRecord(
                        course_id=course_id,
                        has_score=True,
                        raw_score=existing_score.raw_score,
                        grade_point=quantize_storage(recalculated_grade_point),
                        calculated_by_rule=self._rule_engine.rule_id,
                        updated_at=updated_course.updated_at,
                    )
                )
        elif existing_score:
            self._score_repository.delete(course_id)

        return updated_course

    def delete_course(self, course_id: str) -> None:
        course = self._course_repository.get(course_id)
        if course is None:
            raise NotFoundError("课程不存在。")
        self._course_repository.delete(course_id)

    def list_courses(self) -> list[CourseView]:
        courses = self._course_repository.list_all()
        score_map = self._score_repository.list_by_course_ids([course.id for course in courses])
        result: list[CourseView] = []
        for course in courses:
            score_record = score_map.get(course.id)
            result.append(
                CourseView(
                    id=course.id,
                    name=course.name,
                    semester=course.semester,
                    credit=course.credit,
                    status=course.status,
                    score_type=course.score_type,
                    note=course.note,
                    has_score=bool(score_record and score_record.has_score),
                    raw_score=score_record.raw_score if score_record else None,
                    grade_point=score_record.grade_point if score_record else None,
                )
            )
        return result

    def get_course(self, course_id: str) -> Course:
        course = self._course_repository.get(course_id)
        if course is None:
            raise NotFoundError("课程不存在。")
        return course

    @staticmethod
    def _validate_credit(credit: str | int | float | Decimal) -> Decimal:
        decimal_credit = to_decimal(credit)
        if decimal_credit <= 0:
            raise ValidationError("课程学分必须大于 0。")
        return quantize_storage(decimal_credit)

    @classmethod
    def _validate_course_identity(cls, name: str, semester: str) -> None:
        if not name or not name.strip():
            raise ValidationError("课程名称不能为空。")
        if not semester or not semester.strip():
            raise ValidationError("课程学期不能为空。")
        if cls._SEMESTER_PATTERN.fullmatch(semester.strip()) is None:
            raise ValidationError("课程学期格式必须为“年份+季节”，例如：2026春。")

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

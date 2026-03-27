from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from gpa_manager.models.enums import CourseStatus, ScoreType


@dataclass(slots=True)
class CourseCreateCommand:
    name: str
    semester: str
    credit: Decimal | str
    status: CourseStatus
    score_type: ScoreType | None = None
    note: str | None = None


@dataclass(slots=True)
class CourseUpdateCommand:
    name: str
    semester: str
    credit: Decimal | str
    status: CourseStatus
    score_type: ScoreType | None = None
    note: str | None = None


@dataclass(slots=True)
class CourseView:
    id: str
    name: str
    semester: str
    credit: Decimal
    status: CourseStatus
    score_type: ScoreType | None
    note: str | None
    has_score: bool
    raw_score: str | None
    grade_point: Decimal | None


@dataclass(slots=True)
class CourseGpaItem:
    course_id: str
    course_name: str
    semester: str
    credit: Decimal
    score_type: ScoreType
    raw_score: str
    grade_point: Decimal
    quality_points: Decimal


@dataclass(slots=True)
class GpaSummary:
    current_gpa: Decimal | None
    counted_credit_sum: Decimal
    counted_course_count: int
    quality_point_sum: Decimal
    items: list[CourseGpaItem]

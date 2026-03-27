from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from gpa_manager.models.enums import CourseStatus, ScoreType


@dataclass(slots=True)
class Course:
    id: str
    name: str
    semester: str
    credit: Decimal
    status: CourseStatus
    score_type: ScoreType | None
    note: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class ScoreRecord:
    course_id: str
    has_score: bool
    raw_score: str | None
    grade_point: Decimal | None
    calculated_by_rule: str | None
    updated_at: datetime

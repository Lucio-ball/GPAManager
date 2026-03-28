from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from gpa_manager.models.enums import CourseStatus, ScenarioType, ScoreType


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


@dataclass(slots=True)
class PlanningTarget:
    id: str
    target_gpa: Decimal
    based_on_current_gpa: Decimal
    based_on_completed_credit_sum: Decimal
    feasible: bool | None
    infeasible_reason: str | None
    created_at: datetime


@dataclass(slots=True)
class PlanningScenario:
    id: str
    target_id: str
    scenario_type: ScenarioType
    simulated_final_gpa: Decimal | None
    required_future_average_gp: Decimal | None
    created_at: datetime


@dataclass(slots=True)
class ScenarioCourseExpectation:
    id: str
    scenario_id: str
    course_id: str
    expected_score_raw: str | None
    expected_grade_point: Decimal | None
    created_at: datetime
    updated_at: datetime

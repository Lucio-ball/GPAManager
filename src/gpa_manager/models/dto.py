from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from gpa_manager.models.enums import CourseStatus, ScenarioType, ScoreType


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


@dataclass(slots=True)
class PlanningTargetCreateCommand:
    target_gpa: Decimal | str


@dataclass(slots=True)
class ScenarioExpectationSaveCommand:
    scenario_id: str
    course_id: str
    raw_score: str
    score_type: ScoreType | None = None


@dataclass(slots=True)
class PlanningScenarioResult:
    scenario_id: str
    scenario_type: ScenarioType
    simulated_final_gpa: Decimal | None
    required_future_average_gp: Decimal | None
    covered_planned_credit: Decimal
    is_full_coverage: bool
    expectation_count: int


@dataclass(slots=True)
class PlanningTargetResult:
    target_id: str
    target_gpa: Decimal
    based_on_current_gpa: Decimal
    based_on_completed_credit_sum: Decimal
    planned_credit_sum: Decimal
    required_future_average_gp: Decimal | None
    required_score_text: str
    feasible: bool | None
    infeasible_reason: str | None
    scenarios: list[PlanningScenarioResult]

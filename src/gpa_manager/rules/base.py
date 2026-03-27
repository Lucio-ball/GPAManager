from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from gpa_manager.models.enums import ScoreType


class RuleEngine(Protocol):
    @property
    def rule_id(self) -> str:
        ...

    def convert_to_grade_point(self, score_type: ScoreType, raw_score: str) -> Decimal:
        ...

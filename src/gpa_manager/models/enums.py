from __future__ import annotations

from enum import Enum


class CourseStatus(str, Enum):
    COMPLETED = "COMPLETED"
    PLANNED = "PLANNED"

    @property
    def label(self) -> str:
        return "已修" if self is CourseStatus.COMPLETED else "未修"


class ScoreType(str, Enum):
    PERCENTAGE = "PERCENTAGE"
    GRADE = "GRADE"

    @property
    def label(self) -> str:
        return "百分制" if self is ScoreType.PERCENTAGE else "等级制"


class ScenarioType(str, Enum):
    OPTIMISTIC = "OPTIMISTIC"
    NEUTRAL = "NEUTRAL"
    CONSERVATIVE = "CONSERVATIVE"

    @property
    def label(self) -> str:
        mapping = {
            ScenarioType.OPTIMISTIC: "乐观",
            ScenarioType.NEUTRAL: "中性",
            ScenarioType.CONSERVATIVE: "保守",
        }
        return mapping[self]

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

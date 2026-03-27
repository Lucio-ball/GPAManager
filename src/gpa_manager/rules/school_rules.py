from __future__ import annotations

from decimal import Decimal

from gpa_manager.common.decimal_utils import quantize_storage, to_decimal
from gpa_manager.common.exceptions import ValidationError
from gpa_manager.models.enums import ScoreType


class SchoolRuleEngine:
    """School GPA rule implementation from the detailed design document."""

    _GRADE_POINT_MAPPING = {
        "优": Decimal("4.0"),
        "优秀": Decimal("4.0"),
        "良": Decimal("3.5"),
        "良好": Decimal("3.5"),
        "中": Decimal("2.8"),
        "中等": Decimal("2.8"),
        "及格": Decimal("1.7"),
        "不及格": Decimal("0.0"),
    }

    @property
    def rule_id(self) -> str:
        return "SCHOOL_V1"

    def convert_to_grade_point(self, score_type: ScoreType, raw_score: str) -> Decimal:
        normalized_score = raw_score.strip()
        if not normalized_score:
            raise ValidationError("成绩不能为空。")

        if score_type is ScoreType.PERCENTAGE:
            return self._convert_percentage_to_grade_point(normalized_score)
        if score_type is ScoreType.GRADE:
            return self._convert_grade_to_grade_point(normalized_score)
        raise ValidationError(f"不支持的成绩类型：{score_type}")

    def _convert_percentage_to_grade_point(self, raw_score: str) -> Decimal:
        try:
            score = to_decimal(raw_score)
        except Exception as exc:  # pragma: no cover
            raise ValidationError("百分制成绩必须是 0 到 100 之间的数字。") from exc

        if score < 0 or score > 100:
            raise ValidationError("百分制成绩必须在 0 到 100 之间。")
        if score < 60:
            return Decimal("0.0000")

        grade_point = Decimal("4") - (
            Decimal("3") * (Decimal("100") - score) * (Decimal("100") - score) / Decimal("1600")
        )
        return quantize_storage(grade_point)

    def _convert_grade_to_grade_point(self, raw_score: str) -> Decimal:
        if raw_score not in self._GRADE_POINT_MAPPING:
            raise ValidationError("等级制成绩仅支持：优、良好、中等、及格、不及格。")
        return quantize_storage(self._GRADE_POINT_MAPPING[raw_score])

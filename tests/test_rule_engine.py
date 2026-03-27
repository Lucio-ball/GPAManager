from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from gpa_manager.models.enums import ScoreType
from gpa_manager.rules.school_rules import SchoolRuleEngine


class SchoolRuleEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rule_engine = SchoolRuleEngine()

    def test_percentage_mapping_follows_school_formula(self) -> None:
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.PERCENTAGE, "100"), Decimal("4.0000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.PERCENTAGE, "60"), Decimal("1.0000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.PERCENTAGE, "59"), Decimal("0.0000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.PERCENTAGE, "92"), Decimal("3.8800"))

    def test_grade_mapping_matches_school_table(self) -> None:
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.GRADE, "优"), Decimal("4.0000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.GRADE, "良好"), Decimal("3.5000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.GRADE, "中等"), Decimal("2.8000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.GRADE, "及格"), Decimal("1.7000"))
        self.assertEqual(self.rule_engine.convert_to_grade_point(ScoreType.GRADE, "不及格"), Decimal("0.0000"))


if __name__ == "__main__":
    unittest.main()

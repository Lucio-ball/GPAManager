from __future__ import annotations

import sqlite3
from datetime import datetime

from gpa_manager.common.decimal_utils import to_decimal
from gpa_manager.common.sqlite_utils import commit_if_needed
from gpa_manager.models.entities import ScenarioCourseExpectation


class ScenarioCourseExpectationRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def upsert(self, expectation: ScenarioCourseExpectation) -> None:
        was_in_transaction = self._connection.in_transaction
        self._connection.execute(
            """
            INSERT INTO scenario_course_expectations (
                id,
                scenario_id,
                course_id,
                expected_score_raw,
                expected_grade_point,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scenario_id, course_id) DO UPDATE SET
                expected_score_raw = excluded.expected_score_raw,
                expected_grade_point = excluded.expected_grade_point,
                updated_at = excluded.updated_at
            """,
            (
                expectation.id,
                expectation.scenario_id,
                expectation.course_id,
                expectation.expected_score_raw,
                str(expectation.expected_grade_point) if expectation.expected_grade_point is not None else None,
                expectation.created_at.isoformat(),
                expectation.updated_at.isoformat(),
            ),
        )
        commit_if_needed(self._connection, was_in_transaction)

    def get_by_scenario_and_course(self, scenario_id: str, course_id: str) -> ScenarioCourseExpectation | None:
        row = self._connection.execute(
            """
            SELECT * FROM scenario_course_expectations
             WHERE scenario_id = ? AND course_id = ?
            """,
            (scenario_id, course_id),
        ).fetchone()
        return self._to_entity(row) if row else None

    def list_by_scenario_id(self, scenario_id: str) -> list[ScenarioCourseExpectation]:
        rows = self._connection.execute(
            """
            SELECT * FROM scenario_course_expectations
             WHERE scenario_id = ?
             ORDER BY created_at ASC
            """,
            (scenario_id,),
        ).fetchall()
        return [self._to_entity(row) for row in rows]

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> ScenarioCourseExpectation:
        return ScenarioCourseExpectation(
            id=row["id"],
            scenario_id=row["scenario_id"],
            course_id=row["course_id"],
            expected_score_raw=row["expected_score_raw"],
            expected_grade_point=to_decimal(row["expected_grade_point"])
            if row["expected_grade_point"] is not None
            else None,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

from __future__ import annotations

import sqlite3
from datetime import datetime

from gpa_manager.common.sqlite_utils import commit_if_needed
from gpa_manager.common.decimal_utils import to_decimal
from gpa_manager.models.entities import ScoreRecord


class ScoreRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def upsert(self, score_record: ScoreRecord) -> None:
        was_in_transaction = self._connection.in_transaction
        self._connection.execute(
            """
            INSERT INTO score_records (course_id, has_score, raw_score, grade_point, calculated_by_rule, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(course_id) DO UPDATE SET
                has_score = excluded.has_score,
                raw_score = excluded.raw_score,
                grade_point = excluded.grade_point,
                calculated_by_rule = excluded.calculated_by_rule,
                updated_at = excluded.updated_at
            """,
            (
                score_record.course_id,
                1 if score_record.has_score else 0,
                score_record.raw_score,
                str(score_record.grade_point) if score_record.grade_point is not None else None,
                score_record.calculated_by_rule,
                score_record.updated_at.isoformat(),
            ),
        )
        commit_if_needed(self._connection, was_in_transaction)

    def delete(self, course_id: str) -> None:
        was_in_transaction = self._connection.in_transaction
        self._connection.execute("DELETE FROM score_records WHERE course_id = ?", (course_id,))
        commit_if_needed(self._connection, was_in_transaction)

    def get_by_course_id(self, course_id: str) -> ScoreRecord | None:
        row = self._connection.execute(
            "SELECT * FROM score_records WHERE course_id = ?",
            (course_id,),
        ).fetchone()
        return self._to_entity(row) if row else None

    def list_by_course_ids(self, course_ids: list[str]) -> dict[str, ScoreRecord]:
        if not course_ids:
            return {}
        placeholders = ",".join("?" for _ in course_ids)
        rows = self._connection.execute(
            f"SELECT * FROM score_records WHERE course_id IN ({placeholders})",
            course_ids,
        ).fetchall()
        return {row["course_id"]: self._to_entity(row) for row in rows}

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> ScoreRecord:
        return ScoreRecord(
            course_id=row["course_id"],
            has_score=bool(row["has_score"]),
            raw_score=row["raw_score"],
            grade_point=to_decimal(row["grade_point"]) if row["grade_point"] is not None else None,
            calculated_by_rule=row["calculated_by_rule"],
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

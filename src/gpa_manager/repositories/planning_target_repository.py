from __future__ import annotations

import sqlite3
from datetime import datetime

from gpa_manager.common.decimal_utils import to_decimal
from gpa_manager.models.entities import PlanningTarget


class PlanningTargetRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def add(self, target: PlanningTarget) -> None:
        self._connection.execute(
            """
            INSERT INTO planning_targets (
                id,
                target_gpa,
                based_on_current_gpa,
                based_on_completed_credit_sum,
                feasible,
                infeasible_reason,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                target.id,
                str(target.target_gpa),
                str(target.based_on_current_gpa),
                str(target.based_on_completed_credit_sum),
                None if target.feasible is None else int(target.feasible),
                target.infeasible_reason,
                target.created_at.isoformat(),
            ),
        )
        self._connection.commit()

    def get(self, target_id: str) -> PlanningTarget | None:
        row = self._connection.execute(
            "SELECT * FROM planning_targets WHERE id = ?",
            (target_id,),
        ).fetchone()
        return self._to_entity(row) if row else None

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> PlanningTarget:
        return PlanningTarget(
            id=row["id"],
            target_gpa=to_decimal(row["target_gpa"]),
            based_on_current_gpa=to_decimal(row["based_on_current_gpa"]),
            based_on_completed_credit_sum=to_decimal(row["based_on_completed_credit_sum"]),
            feasible=None if row["feasible"] is None else bool(row["feasible"]),
            infeasible_reason=row["infeasible_reason"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

from __future__ import annotations

import sqlite3
from datetime import datetime

from gpa_manager.common.decimal_utils import to_decimal
from gpa_manager.common.sqlite_utils import commit_if_needed
from gpa_manager.models.entities import PlanningScenario
from gpa_manager.models.enums import ScenarioType


class PlanningScenarioRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def add(self, scenario: PlanningScenario) -> None:
        was_in_transaction = self._connection.in_transaction
        self._connection.execute(
            """
            INSERT INTO planning_scenarios (
                id,
                target_id,
                scenario_type,
                simulated_final_gpa,
                required_future_average_gp,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                scenario.id,
                scenario.target_id,
                scenario.scenario_type.value,
                str(scenario.simulated_final_gpa) if scenario.simulated_final_gpa is not None else None,
                str(scenario.required_future_average_gp) if scenario.required_future_average_gp is not None else None,
                scenario.created_at.isoformat(),
            ),
        )
        commit_if_needed(self._connection, was_in_transaction)

    def update(self, scenario: PlanningScenario) -> None:
        was_in_transaction = self._connection.in_transaction
        self._connection.execute(
            """
            UPDATE planning_scenarios
               SET simulated_final_gpa = ?, required_future_average_gp = ?
             WHERE id = ?
            """,
            (
                str(scenario.simulated_final_gpa) if scenario.simulated_final_gpa is not None else None,
                str(scenario.required_future_average_gp) if scenario.required_future_average_gp is not None else None,
                scenario.id,
            ),
        )
        commit_if_needed(self._connection, was_in_transaction)

    def get(self, scenario_id: str) -> PlanningScenario | None:
        row = self._connection.execute(
            "SELECT * FROM planning_scenarios WHERE id = ?",
            (scenario_id,),
        ).fetchone()
        return self._to_entity(row) if row else None

    def list_by_target_id(self, target_id: str) -> list[PlanningScenario]:
        rows = self._connection.execute(
            """
            SELECT * FROM planning_scenarios
             WHERE target_id = ?
             ORDER BY CASE scenario_type
                 WHEN 'OPTIMISTIC' THEN 1
                 WHEN 'NEUTRAL' THEN 2
                 ELSE 3
             END
            """,
            (target_id,),
        ).fetchall()
        return [self._to_entity(row) for row in rows]

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> PlanningScenario:
        return PlanningScenario(
            id=row["id"],
            target_id=row["target_id"],
            scenario_type=ScenarioType(row["scenario_type"]),
            simulated_final_gpa=to_decimal(row["simulated_final_gpa"]) if row["simulated_final_gpa"] is not None else None,
            required_future_average_gp=to_decimal(row["required_future_average_gp"])
            if row["required_future_average_gp"] is not None
            else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

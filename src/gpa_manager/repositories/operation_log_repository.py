from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from gpa_manager.common.sqlite_utils import commit_if_needed
from gpa_manager.models.entities import OperationLogEntry


class OperationLogRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def add(self, entry: OperationLogEntry) -> None:
        was_in_transaction = self._connection.in_transaction
        self._connection.execute(
            """
            INSERT INTO operation_logs (
                id,
                operation_type,
                object_type,
                object_summary,
                status,
                message,
                created_at,
                details_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.id,
                entry.operation_type,
                entry.object_type,
                entry.object_summary,
                entry.status,
                entry.message,
                entry.created_at.isoformat(),
                entry.details_json,
            ),
        )
        commit_if_needed(self._connection, was_in_transaction)

    def list_recent(self, limit: int = 20) -> list[OperationLogEntry]:
        normalized_limit = max(1, min(limit, 100))
        rows = self._connection.execute(
            """
            SELECT *
              FROM operation_logs
          ORDER BY created_at DESC, id DESC
             LIMIT ?
            """,
            (normalized_limit,),
        ).fetchall()
        return [self._to_entity(row) for row in rows]

    @staticmethod
    def encode_details(details: dict[str, Any] | None) -> str | None:
        if not details:
            return None
        return json.dumps(details, ensure_ascii=False, sort_keys=True)

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> OperationLogEntry:
        return OperationLogEntry(
            id=row["id"],
            operation_type=row["operation_type"],
            object_type=row["object_type"],
            object_summary=row["object_summary"],
            status=row["status"],
            message=row["message"],
            created_at=datetime.fromisoformat(row["created_at"]),
            details_json=row["details_json"],
        )

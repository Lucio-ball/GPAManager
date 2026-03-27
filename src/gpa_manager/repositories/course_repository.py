from __future__ import annotations

import sqlite3
from datetime import datetime

from gpa_manager.common.decimal_utils import to_decimal
from gpa_manager.models.entities import Course
from gpa_manager.models.enums import CourseStatus, ScoreType


class CourseRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def add(self, course: Course) -> None:
        self._connection.execute(
            """
            INSERT INTO courses (id, name, semester, credit, status, score_type, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                course.id,
                course.name,
                course.semester,
                str(course.credit),
                course.status.value,
                course.score_type.value if course.score_type else None,
                course.note,
                course.created_at.isoformat(),
                course.updated_at.isoformat(),
            ),
        )
        self._connection.commit()

    def update(self, course: Course) -> None:
        self._connection.execute(
            """
            UPDATE courses
               SET name = ?, semester = ?, credit = ?, status = ?, score_type = ?, note = ?, updated_at = ?
             WHERE id = ?
            """,
            (
                course.name,
                course.semester,
                str(course.credit),
                course.status.value,
                course.score_type.value if course.score_type else None,
                course.note,
                course.updated_at.isoformat(),
                course.id,
            ),
        )
        self._connection.commit()

    def delete(self, course_id: str) -> None:
        self._connection.execute("DELETE FROM courses WHERE id = ?", (course_id,))
        self._connection.commit()

    def get(self, course_id: str) -> Course | None:
        row = self._connection.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
        return self._to_entity(row) if row else None

    def find_by_name_and_semester(self, name: str, semester: str) -> Course | None:
        row = self._connection.execute(
            "SELECT * FROM courses WHERE name = ? AND semester = ?",
            (name, semester),
        ).fetchone()
        return self._to_entity(row) if row else None

    def list_all(self) -> list[Course]:
        rows = self._connection.execute(
            "SELECT * FROM courses ORDER BY semester ASC, name ASC"
        ).fetchall()
        return [self._to_entity(row) for row in rows]

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Course:
        return Course(
            id=row["id"],
            name=row["name"],
            semester=row["semester"],
            credit=to_decimal(row["credit"]),
            status=CourseStatus(row["status"]),
            score_type=ScoreType(row["score_type"]) if row["score_type"] else None,
            note=row["note"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

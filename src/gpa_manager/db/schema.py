from __future__ import annotations

import sqlite3


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS courses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            semester TEXT NOT NULL,
            credit TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'PLANNED')),
            score_type TEXT NULL CHECK (score_type IN ('PERCENTAGE', 'GRADE')),
            note TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(name, semester)
        );

        CREATE TABLE IF NOT EXISTS score_records (
            course_id TEXT PRIMARY KEY,
            has_score INTEGER NOT NULL CHECK (has_score IN (0, 1)),
            raw_score TEXT NULL,
            grade_point TEXT NULL,
            calculated_by_rule TEXT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
        );
        """
    )
    connection.commit()

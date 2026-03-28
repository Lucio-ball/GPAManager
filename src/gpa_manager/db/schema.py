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

        CREATE TABLE IF NOT EXISTS planning_targets (
            id TEXT PRIMARY KEY,
            target_gpa TEXT NOT NULL,
            based_on_current_gpa TEXT NOT NULL,
            based_on_completed_credit_sum TEXT NOT NULL,
            feasible INTEGER NULL CHECK (feasible IN (0, 1)),
            infeasible_reason TEXT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS planning_scenarios (
            id TEXT PRIMARY KEY,
            target_id TEXT NOT NULL,
            scenario_type TEXT NOT NULL CHECK (scenario_type IN ('OPTIMISTIC', 'NEUTRAL', 'CONSERVATIVE')),
            simulated_final_gpa TEXT NULL,
            required_future_average_gp TEXT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(target_id) REFERENCES planning_targets(id) ON DELETE CASCADE,
            UNIQUE(target_id, scenario_type)
        );

        CREATE TABLE IF NOT EXISTS scenario_course_expectations (
            id TEXT PRIMARY KEY,
            scenario_id TEXT NOT NULL,
            course_id TEXT NOT NULL,
            expected_score_raw TEXT NULL,
            expected_grade_point TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(scenario_id) REFERENCES planning_scenarios(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE(scenario_id, course_id)
        );
        """
    )
    connection.commit()

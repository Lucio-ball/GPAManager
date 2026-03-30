from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from gpa_manager.common.exceptions import DatabaseMigrationError
from gpa_manager.common.sqlite_utils import atomic


CURRENT_SCHEMA_VERSION = 2
CORE_TABLES = {
    "courses",
    "score_records",
    "planning_targets",
    "planning_scenarios",
    "scenario_course_expectations",
}


@dataclass(slots=True)
class SchemaState:
    schema_version: int
    previous_version: int
    migrated: bool
    initialized_new_database: bool
    migration_backup_path: str | None = None


def initialize_database(connection: sqlite3.Connection) -> None:
    _create_core_tables(connection)
    _create_operation_log_table(connection)
    _set_user_version(connection, CURRENT_SCHEMA_VERSION)
    connection.commit()


def ensure_database_schema(
    connection: sqlite3.Connection,
    database_path: str | Path,
) -> SchemaState:
    resolved_path = Path(database_path).resolve()
    existing_tables = _get_user_tables(connection)
    had_existing_data = bool(existing_tables)
    previous_version = _get_user_version(connection)

    if previous_version > CURRENT_SCHEMA_VERSION:
        raise DatabaseMigrationError(
            f"当前数据库 schema 版本为 v{previous_version}，高于应用支持的 v{CURRENT_SCHEMA_VERSION}。"
            " 请先升级应用版本，或恢复到当前版本可识别的备份。"
        )

    current_version = previous_version
    if current_version == 0:
        if not had_existing_data:
            _create_core_tables(connection)
            _set_user_version(connection, 1)
            current_version = 1
        else:
            missing_tables = sorted(CORE_TABLES - existing_tables)
            if missing_tables:
                raise DatabaseMigrationError(
                    "检测到已有 SQLite 数据库，但缺少核心表："
                    f"{', '.join(missing_tables)}。"
                    " 这通常意味着数据库文件不完整；请先恢复有效备份，再重新启动应用。"
                )
            _set_user_version(connection, 1)
            current_version = 1

    migration_backup_path: str | None = None
    if had_existing_data and current_version < CURRENT_SCHEMA_VERSION:
        migration_backup_path = _create_migration_backup(
            connection=connection,
            database_path=resolved_path,
            from_version=current_version,
            to_version=CURRENT_SCHEMA_VERSION,
        )

    while current_version < CURRENT_SCHEMA_VERSION:
        target_version = current_version + 1
        migration = _MIGRATIONS.get(target_version)
        if migration is None:
            raise DatabaseMigrationError(f"缺少 schema v{target_version} 的迁移逻辑。")

        try:
            with atomic(connection):
                migration(connection)
                _set_user_version(connection, target_version)
        except sqlite3.Error as exc:
            raise DatabaseMigrationError(
                f"数据库迁移到 v{target_version} 失败：{exc}。"
                " 本次升级未完成，请查看自动生成的迁移备份后重试。"
            ) from exc

        current_version = target_version

    return SchemaState(
        schema_version=current_version,
        previous_version=previous_version,
        migrated=had_existing_data and current_version != previous_version,
        initialized_new_database=not had_existing_data and previous_version == 0,
        migration_backup_path=migration_backup_path,
    )


def _create_core_tables(connection: sqlite3.Connection) -> None:
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


def _create_operation_log_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS operation_logs (
            id TEXT PRIMARY KEY,
            operation_type TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_summary TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE')),
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            details_json TEXT NULL
        )
        """
    )


def _apply_migration_v2(connection: sqlite3.Connection) -> None:
    _create_operation_log_table(connection)


_MIGRATIONS: dict[int, callable] = {
    2: _apply_migration_v2,
}


def _get_user_tables(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        """
        SELECT name
          FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
        """
    ).fetchall()
    return {str(row["name"]) for row in rows}


def _get_user_version(connection: sqlite3.Connection) -> int:
    row = connection.execute("PRAGMA user_version").fetchone()
    if row is None:
        return 0
    value = row[0] if not isinstance(row, sqlite3.Row) else row["user_version"]
    return int(value or 0)


def _set_user_version(connection: sqlite3.Connection, version: int) -> None:
    connection.execute(f"PRAGMA user_version = {int(version)}")


def _create_migration_backup(
    *,
    connection: sqlite3.Connection,
    database_path: Path,
    from_version: int,
    to_version: int,
) -> str:
    backup_directory = database_path.parent / "backups"
    backup_directory.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    backup_name = f"gpa-manager-pre-migration-v{from_version}-to-v{to_version}-{timestamp}.sqlite3"
    backup_path = backup_directory / backup_name

    connection.execute("PRAGMA wal_checkpoint(FULL)")
    backup_connection = sqlite3.connect(str(backup_path))
    try:
        connection.backup(backup_connection)
    except sqlite3.Error as exc:
        raise DatabaseMigrationError(
            f"创建迁移前安全备份失败：{exc}。为避免升级中断后难以恢复，本次启动已停止。"
        ) from exc
    finally:
        backup_connection.close()

    return str(backup_path)

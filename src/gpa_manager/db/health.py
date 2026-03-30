from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from gpa_manager.db.schema import CORE_TABLES, SchemaState
from gpa_manager.rules.school_rules import SchoolRuleEngine


@dataclass(slots=True)
class StartupCheckItem:
    key: str
    label: str
    status: str
    detail: str
    hint: str


@dataclass(slots=True)
class StartupHealthReport:
    checked_at: datetime
    status: str
    summary: str
    schema_version: int
    items: list[StartupCheckItem]


def run_startup_self_check(
    connection: sqlite3.Connection,
    database_path: str | Path,
    schema_state: SchemaState,
) -> StartupHealthReport:
    resolved_database_path = Path(database_path).resolve()
    data_directory = resolved_database_path.parent

    items = [
        _check_database_file(resolved_database_path, schema_state),
        _check_app_data_directory(data_directory),
        _check_python_bridge_dependencies(),
        _check_core_tables(connection),
    ]

    has_failure = any(item.status == "FAIL" for item in items)
    status = "FAIL" if has_failure else "PASS"

    if has_failure:
        summary = "启动自检未通过，请先按下方提示修复后再继续使用。"
    elif schema_state.migrated:
        summary = f"启动自检通过，数据库已自动升级到 schema v{schema_state.schema_version}。"
    elif schema_state.initialized_new_database:
        summary = f"启动自检通过，已完成本地数据库初始化（schema v{schema_state.schema_version}）。"
    else:
        summary = f"启动自检通过，当前数据库 schema v{schema_state.schema_version} 可直接使用。"

    return StartupHealthReport(
        checked_at=datetime.now().astimezone(),
        status=status,
        summary=summary,
        schema_version=schema_state.schema_version,
        items=items,
    )


def _check_database_file(database_path: Path, schema_state: SchemaState) -> StartupCheckItem:
    if not database_path.exists():
        return StartupCheckItem(
            key="database-file",
            label="数据库文件",
            status="FAIL",
            detail=f"未找到数据库文件：{database_path}",
            hint="请确认应用数据目录仍可访问；如果文件被误删，可先从最近一次 SQLite 备份恢复。",
        )

    if not database_path.is_file():
        return StartupCheckItem(
            key="database-file",
            label="数据库文件",
            status="FAIL",
            detail=f"数据库路径不是文件：{database_path}",
            hint="请检查设置里的数据库路径是否被目录占用；必要时迁走异常目录后重新启动。",
        )

    detail = f"数据库文件可访问：{database_path}"
    if schema_state.migrated and schema_state.migration_backup_path:
        detail += f"；已生成迁移前备份：{schema_state.migration_backup_path}"

    return StartupCheckItem(
        key="database-file",
        label="数据库文件",
        status="PASS",
        detail=detail,
        hint="如果后续升级异常，可优先回滚到最近的迁移前备份或手动备份文件。",
    )


def _check_app_data_directory(data_directory: Path) -> StartupCheckItem:
    try:
        data_directory.mkdir(parents=True, exist_ok=True)
        probe_path = data_directory / f".gpa-manager-write-check-{uuid4().hex}.tmp"
        probe_path.write_text("ok", encoding="utf-8")
        probe_path.unlink()
    except OSError as exc:
        return StartupCheckItem(
            key="data-directory",
            label="应用数据目录",
            status="FAIL",
            detail=f"应用数据目录不可写：{data_directory}（{exc}）",
            hint="请检查目录权限、磁盘空间或 OneDrive/系统同步占用；修复后重新启动应用。",
        )

    return StartupCheckItem(
        key="data-directory",
        label="应用数据目录",
        status="PASS",
        detail=f"应用数据目录可写：{data_directory}",
        hint="备份、导出和自动迁移前安全备份都会写入这个目录下的子目录。",
    )


def _check_python_bridge_dependencies() -> StartupCheckItem:
    try:
        rule_engine = SchoolRuleEngine()
        detail = (
            "Python bridge 关键依赖已加载："
            f"sqlite3 {sqlite3.sqlite_version}，规则引擎 {rule_engine.rule_id}。"
        )
        return StartupCheckItem(
            key="python-bridge",
            label="Python Bridge 依赖",
            status="PASS",
            detail=detail,
            hint="如果未来这里失败，优先检查桌面环境里的 Python 解释器和本地依赖是否仍可执行。",
        )
    except Exception as exc:  # pragma: no cover - defensive path
        return StartupCheckItem(
            key="python-bridge",
            label="Python Bridge 依赖",
            status="FAIL",
            detail=f"Python bridge 关键依赖加载失败：{exc}",
            hint="请检查桌面端正在使用的 Python 是否可运行，以及 bridge 脚本对应的源码是否完整。",
        )


def _check_core_tables(connection: sqlite3.Connection) -> StartupCheckItem:
    rows = connection.execute(
        """
        SELECT name
          FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
        """
    ).fetchall()
    tables = {str(row["name"]) for row in rows}
    missing_tables = sorted(CORE_TABLES - tables)
    if missing_tables:
        return StartupCheckItem(
            key="core-tables",
            label="核心数据表",
            status="FAIL",
            detail=f"缺少核心表：{', '.join(missing_tables)}",
            hint="数据库结构不完整，建议先恢复最近一次可用备份，再重新启动应用。",
        )

    return StartupCheckItem(
        key="core-tables",
        label="核心数据表",
        status="PASS",
        detail=f"核心表已就绪：{', '.join(sorted(CORE_TABLES))}",
        hint="如果手动替换过数据库文件，这一项能帮助尽早发现结构不完整的问题。",
    )

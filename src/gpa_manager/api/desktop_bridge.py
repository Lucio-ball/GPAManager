from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
from dataclasses import asdict, is_dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from gpa_manager.common.exceptions import DatabaseMigrationError
from gpa_manager.common.utils import new_id
from gpa_manager.db.connection import create_connection
from gpa_manager.db.health import run_startup_self_check
from gpa_manager.db.schema import CURRENT_SCHEMA_VERSION, ensure_database_schema
from gpa_manager.models.dto import (
    CourseCreateCommand,
    CourseUpdateCommand,
    PlanningTargetCreateCommand,
    ScenarioExpectationSaveCommand,
)
from gpa_manager.models.entities import OperationLogEntry
from gpa_manager.models.enums import CourseStatus, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.operation_log_repository import OperationLogRepository
from gpa_manager.repositories.planning_scenario_repository import PlanningScenarioRepository
from gpa_manager.repositories.planning_target_repository import PlanningTargetRepository
from gpa_manager.repositories.scenario_course_expectation_repository import (
    ScenarioCourseExpectationRepository,
)
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.school_rules import SchoolRuleEngine
from gpa_manager.services.course_service import CourseService
from gpa_manager.services.gpa_service import GpaCalculationService
from gpa_manager.services.import_service import ImportService
from gpa_manager.services.planning_service import PlanningService
from gpa_manager.services.score_service import ScoreService


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class DesktopBridgeApp:
    def __init__(self, database_path: str | Path | None = None) -> None:
        resolved_database = self._resolve_database_path(database_path)
        resolved_database.parent.mkdir(parents=True, exist_ok=True)
        self._database_path = resolved_database.resolve()
        self._connection: sqlite3.Connection | None = None
        self._schema_state = None
        self._startup_health = None
        self._bootstrap_runtime()

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def snapshot(self) -> dict[str, Any]:
        summary = self._gpa_service.calculate_current_gpa()
        courses = self._course_service.list_courses()
        latest_target_row = self._connection.execute(
            "SELECT id FROM planning_targets ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        latest_target = (
            self._get_planning_target_payload(latest_target_row["id"])
            if latest_target_row is not None
            else None
        )
        course_template_text = (
            "course_name=Operating Systems;semester=2025秋;credit=4.0;status=PLANNED;"
            "score_type=PERCENTAGE;note=核心课\n"
            "course_name=Computer Networks;semester=2025秋;credit=3.0;status=PLANNED;"
            "score_type=PERCENTAGE"
        )
        score_template_text = (
            "course_name=Advanced Mathematics;semester=2024秋;raw_score=92\n"
            "course_name=College English;semester=2024秋;raw_score=88"
        )

        return {
            "summary": summary,
            "courses": courses,
            "latest_planning": latest_target,
            "import_templates": {
                "course_text_example": course_template_text,
                "score_text_example": score_template_text,
                "course": {
                    "title": "课程导入模板",
                    "text_example": course_template_text,
                    "field_guides": [
                        {
                            "name": "course_name",
                            "required": True,
                            "description": "课程名称；后续成绩导入时也要使用同名同学期定位课程。",
                        },
                        {
                            "name": "semester",
                            "required": True,
                            "description": "学期文本；建议保持如 2025秋、2026春 这样的统一写法。",
                        },
                        {
                            "name": "credit",
                            "required": True,
                            "description": "正数学分；支持 3、3.0、3.5 这类十进制写法。",
                        },
                        {
                            "name": "status",
                            "required": True,
                            "description": "只能填写 COMPLETED 或 PLANNED。",
                        },
                        {
                            "name": "score_type",
                            "required": False,
                            "description": "可选；若填写，只能是 PERCENTAGE 或 GRADE。",
                        },
                        {
                            "name": "note",
                            "required": False,
                            "description": "可选备注，不参与 GPA 计算。",
                        },
                    ],
                    "common_mistakes": [
                        "每行一条记录，字段必须写成 key=value，并用英文分号 ; 分隔。",
                        "status 只能是 COMPLETED / PLANNED；score_type 如果填写，只能是 PERCENTAGE / GRADE。",
                    ],
                },
                "score": {
                    "title": "成绩导入模板",
                    "text_example": score_template_text,
                    "field_guides": [
                        {
                            "name": "course_name",
                            "required": True,
                            "description": "课程名称；必须能在现有课程库里找到同名同学期课程。",
                        },
                        {
                            "name": "semester",
                            "required": True,
                            "description": "学期文本；需要与已存在课程记录完全匹配。",
                        },
                        {
                            "name": "raw_score",
                            "required": True,
                            "description": "原始成绩值；会按课程成绩类型走真实规则校验。",
                        },
                        {
                            "name": "score_type",
                            "required": False,
                            "description": "课程上没设成绩类型时可补填；只能是 PERCENTAGE 或 GRADE。",
                        },
                    ],
                    "common_mistakes": [
                        "成绩导入前，课程必须已经存在，且课程状态必须是 COMPLETED。",
                        "如果课程和导入行都没有 score_type，或者两边 score_type 冲突，预检会直接失败。",
                    ],
                },
            },
        }

    def get_app_info(self) -> dict[str, Any]:
        data_directory = self._database_path.parent
        backup_directory = data_directory / "backups"
        export_directory = data_directory / "exports"

        return {
            "database_path": str(self._database_path),
            "data_directory": str(data_directory),
            "backup_directory": str(backup_directory),
            "export_directory": str(export_directory),
            "schema_version": self._schema_state.schema_version,
        }

    def get_startup_health(self) -> Any:
        return self._startup_health

    def list_operation_logs(self, payload: dict[str, Any]) -> list[OperationLogEntry]:
        limit = int(payload.get("limit", 12))
        return self._operation_log_repository.list_recent(limit=limit)

    def list_database_backups(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        limit = int(payload.get("limit", 12))
        backup_directory = self._database_path.parent / "backups"
        if not backup_directory.exists():
            return []

        backup_files = sorted(
            (
                path
                for path in backup_directory.glob("*.sqlite3")
                if path.is_file()
            ),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )[: max(1, min(limit, 100))]

        return [self._build_file_info(path) for path in backup_files]

    def create_database_backup(self, payload: dict[str, Any]) -> dict[str, Any]:
        label = self._normalize_file_label(payload.get("label"))
        return self._run_logged_operation(
            operation_type="data.backup",
            object_type="backup",
            object_summary="数据库完整备份",
            success_message="已创建 SQLite 备份。",
            details_builder=lambda result: {
                "path": result["path"],
                "size_bytes": result["size_bytes"],
            },
            action=lambda: self._create_database_backup_file(label=label),
        )

    def export_snapshot(self, payload: dict[str, Any]) -> dict[str, Any]:
        label = self._normalize_file_label(payload.get("label"))
        return self._run_logged_operation(
            operation_type="data.export",
            object_type="export",
            object_summary="JSON 快照导出",
            success_message="已导出当前数据快照。",
            details_builder=lambda result: {
                "path": result["path"],
                "record_count": result["record_count"],
            },
            action=lambda: self._export_snapshot_file(label=label),
        )

    def restore_database_backup(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not bool(payload.get("confirmed", False)):
            raise ValueError("恢复备份前必须完成强确认。")

        backup_path = Path(str(payload.get("backupPath", ""))).expanduser().resolve()
        backup_directory = (self._database_path.parent / "backups").resolve()
        if not backup_path.exists():
            raise ValueError("指定的备份文件不存在，请先刷新备份列表后重试。")
        if not backup_path.is_file():
            raise ValueError("指定的恢复来源不是有效的 SQLite 备份文件。")
        if backup_path.suffix.lower() != ".sqlite3":
            raise ValueError("当前只支持从 .sqlite3 数据库备份恢复。")
        if backup_directory not in backup_path.parents:
            raise ValueError("为避免误恢复，当前只允许从应用备份目录中的 SQLite 文件恢复。")

        return self._run_logged_operation(
            operation_type="data.restore_backup",
            object_type="backup",
            object_summary=backup_path.name,
            success_message="已从备份恢复当前数据库。",
            details_builder=lambda result: {
                "restored_from": result["restored_from"],
                "safeguard_backup_path": result["safeguard_backup_path"],
            },
            action=lambda: self._restore_database_from_backup(backup_path),
        )

    def create_planning_target(self, payload: dict[str, Any]) -> Any:
        target_gpa = str(payload["targetGpa"])
        return self._run_logged_operation(
            operation_type="planning.create_target",
            object_type="planning_target",
            object_summary=f"目标 GPA {target_gpa}",
            success_message=f"已创建目标 GPA {target_gpa}。",
            action=lambda: self._create_planning_target_impl(target_gpa),
        )

    def save_planning_expectations(self, payload: dict[str, Any]) -> Any:
        target_id = str(payload["targetId"])
        expectation_count = len(payload.get("expectations", []))
        return self._run_logged_operation(
            operation_type="planning.save_expectations",
            object_type="planning_expectation",
            object_summary=f"target={target_id}，items={expectation_count}",
            success_message="已保存规划预期并刷新情景结果。",
            details_builder=lambda _result: {
                "target_id": target_id,
                "expectation_count": expectation_count,
            },
            action=lambda: self._save_planning_expectations_impl(payload),
        )

    def run_import(self, payload: dict[str, Any]) -> dict[str, Any]:
        apply = bool(payload.get("apply", False))
        if not apply:
            return self._run_import_impl(payload)

        kind = str(payload["kind"]).upper()
        return self._run_logged_operation(
            operation_type="import.run",
            object_type="import",
            object_summary=f"{kind} 批量导入",
            success_message=f"{kind} 批量导入已执行。",
            details_builder=lambda result: {
                "kind": kind,
                "success_count": result["success_count"],
                "error_count": result["error_count"],
            },
            action=lambda: self._run_import_impl(payload),
        )

    def create_course(self, payload: dict[str, Any]) -> Any:
        course_summary = f"{str(payload['name']).strip()} ({str(payload['semester']).strip()})"
        return self._run_logged_operation(
            operation_type="course.create",
            object_type="course",
            object_summary=course_summary,
            success_message="已创建课程。",
            action=lambda: self._create_course_impl(payload),
        )

    def update_course(self, payload: dict[str, Any]) -> Any:
        course_summary = f"{str(payload['name']).strip()} ({str(payload['semester']).strip()})"
        return self._run_logged_operation(
            operation_type="course.update",
            object_type="course",
            object_summary=course_summary,
            success_message="已更新课程。",
            action=lambda: self._update_course_impl(payload),
        )

    def delete_course(self, payload: dict[str, Any]) -> dict[str, Any]:
        course_id = str(payload["courseId"])
        course = self._course_service.get_course(course_id)
        course_summary = f"{course.name} ({course.semester})"
        return self._run_logged_operation(
            operation_type="course.delete",
            object_type="course",
            object_summary=course_summary,
            success_message="已删除课程。",
            details_builder=lambda _result: {"course_id": course_id},
            action=lambda: self._delete_course_impl(course_id),
        )

    def record_score(self, payload: dict[str, Any]) -> Any:
        course = self._course_service.get_course(str(payload["courseId"]))
        course_summary = f"{course.name} ({course.semester}) -> {str(payload['rawScore']).strip()}"
        return self._run_logged_operation(
            operation_type="score.record",
            object_type="score",
            object_summary=course_summary,
            success_message="已保存课程成绩。",
            action=lambda: self._record_score_impl(payload),
        )

    def clear_score(self, payload: dict[str, Any]) -> Any:
        course = self._course_service.get_course(str(payload["courseId"]))
        course_summary = f"{course.name} ({course.semester})"
        return self._run_logged_operation(
            operation_type="score.clear",
            object_type="score",
            object_summary=course_summary,
            success_message="已清空课程成绩。",
            action=lambda: self._clear_score_impl(payload),
        )

    def _bootstrap_runtime(self) -> None:
        try:
            connection = create_connection(self._database_path)
        except sqlite3.Error as exc:
            raise RuntimeError(
                f"无法打开本地数据库：{self._database_path}。请检查应用数据目录权限或路径占用情况。原始错误：{exc}"
            ) from exc

        try:
            schema_state = ensure_database_schema(connection, self._database_path)
        except Exception:
            connection.close()
            raise

        self._connection = connection
        self._schema_state = schema_state

        self._course_repository = CourseRepository(connection)
        self._score_repository = ScoreRepository(connection)
        self._planning_target_repository = PlanningTargetRepository(connection)
        self._planning_scenario_repository = PlanningScenarioRepository(connection)
        self._expectation_repository = ScenarioCourseExpectationRepository(connection)
        self._operation_log_repository = OperationLogRepository(connection)
        self._rule_engine = SchoolRuleEngine()

        self._course_service = CourseService(
            self._course_repository,
            self._score_repository,
            self._rule_engine,
        )
        self._score_service = ScoreService(
            self._course_repository,
            self._score_repository,
            self._rule_engine,
        )
        self._gpa_service = GpaCalculationService(self._course_repository, self._score_repository)
        self._planning_service = PlanningService(
            self._course_repository,
            self._planning_target_repository,
            self._planning_scenario_repository,
            self._expectation_repository,
            self._gpa_service,
            self._rule_engine,
        )
        self._import_service = ImportService(
            connection=connection,
            course_repository=self._course_repository,
            score_repository=self._score_repository,
            course_service=self._course_service,
            score_service=self._score_service,
            rule_engine=self._rule_engine,
        )
        self._startup_health = run_startup_self_check(
            connection=connection,
            database_path=self._database_path,
            schema_state=schema_state,
        )

    def _create_database_backup_file(self, label: str | None = None) -> dict[str, Any]:
        created_at = datetime.now().astimezone()
        backup_directory = self._database_path.parent / "backups"
        backup_directory.mkdir(parents=True, exist_ok=True)

        suffix = f"-{label}" if label else ""
        file_name = f"gpa-manager-backup-{created_at.strftime('%Y%m%d-%H%M%S')}{suffix}.sqlite3"
        backup_path = backup_directory / file_name

        self._connection.execute("PRAGMA wal_checkpoint(FULL)")
        backup_connection = sqlite3.connect(str(backup_path))
        try:
            self._connection.backup(backup_connection)
        finally:
            backup_connection.close()

        return {
            "path": str(backup_path),
            "file_name": file_name,
            "created_at": created_at,
            "size_bytes": backup_path.stat().st_size,
        }

    def _export_snapshot_file(self, label: str | None = None) -> dict[str, Any]:
        created_at = datetime.now().astimezone()
        export_directory = self._database_path.parent / "exports"
        export_directory.mkdir(parents=True, exist_ok=True)

        suffix = f"-{label}" if label else ""
        file_name = f"gpa-manager-export-{created_at.strftime('%Y%m%d-%H%M%S')}{suffix}.json"
        export_path = export_directory / file_name
        snapshot_payload = serialize_for_frontend(self.snapshot())

        export_payload = {
            "exported_at": created_at.isoformat(),
            "app_info": self.get_app_info(),
            "snapshot": snapshot_payload,
        }
        export_path.write_text(
            json.dumps(export_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return {
            "path": str(export_path),
            "file_name": file_name,
            "created_at": created_at,
            "record_count": len(snapshot_payload["courses"]),
            "size_bytes": export_path.stat().st_size,
        }

    def _restore_database_from_backup(self, backup_path: Path) -> dict[str, Any]:
        safeguard_backup = self._create_database_backup_file(label="pre-restore")
        temp_restore_path = self._database_path.with_suffix(f"{self._database_path.suffix}.restore")

        self.close()

        try:
            shutil.copy2(backup_path, temp_restore_path)
            self._remove_sqlite_sidecars(self._database_path)
            temp_restore_path.replace(self._database_path)
            self._bootstrap_runtime()
        except Exception as exc:
            if temp_restore_path.exists():
                temp_restore_path.unlink(missing_ok=True)
            raise RuntimeError(
                "从备份恢复失败。当前数据库已保留恢复前的安全备份，"
                f"可使用 {safeguard_backup['path']} 手动回滚。原始错误：{exc}"
            ) from exc

        return {
            "restored_from": str(backup_path),
            "restored_at": datetime.now().astimezone(),
            "safeguard_backup_path": safeguard_backup["path"],
            "schema_version": self._schema_state.schema_version,
        }

    def _create_planning_target_impl(self, target_gpa: str) -> Any:
        target = self._planning_service.create_target(
            PlanningTargetCreateCommand(target_gpa=target_gpa)
        )
        return self._get_planning_target_payload(target.target_id)

    def _save_planning_expectations_impl(self, payload: dict[str, Any]) -> Any:
        target_id = str(payload["targetId"])
        scenario_ids = {
            scenario.id for scenario in self._planning_scenario_repository.list_by_target_id(target_id)
        }
        if not scenario_ids:
            raise ValueError("Planning target does not exist.")

        for item in payload.get("expectations", []):
            scenario_id = str(item["scenarioId"])
            if scenario_id not in scenario_ids:
                raise ValueError("Scenario does not belong to the current planning target.")

            course_id = str(item["courseId"])
            raw_score = item.get("rawScore")
            if raw_score is None or not str(raw_score).strip():
                self._expectation_repository.delete_by_scenario_and_course(scenario_id, course_id)
                continue

            score_type_value = item.get("scoreType")
            self._planning_service.save_scenario_expectation(
                ScenarioExpectationSaveCommand(
                    scenario_id=scenario_id,
                    course_id=course_id,
                    raw_score=str(raw_score),
                    score_type=ScoreType(str(score_type_value).upper()) if score_type_value else None,
                )
            )

        return self._get_planning_target_payload(target_id)

    def _run_import_impl(self, payload: dict[str, Any]) -> dict[str, Any]:
        kind = str(payload["kind"]).upper()
        text = str(payload.get("text", ""))
        apply = bool(payload.get("apply", False))
        confirmed = bool(payload.get("confirmed", False))

        if not text.strip():
            raise ValueError("导入内容不能为空。")
        if apply and not confirmed:
            raise ValueError("正式导入前必须先完成确认。")

        if kind == "COURSE":
            parsed = self._import_service.parse_course_import_text(text)
            validation = self._import_service.validate_course_import_data(parsed)
            if apply:
                if not validation.valid_records:
                    raise ValueError("当前没有可导入的有效课程记录，请先修正预检问题。")
                report = self._import_service.import_courses(validation)
                return {
                    "kind": kind,
                    "parsed_count": len(parsed.records),
                    "valid_count": len(validation.valid_records),
                    "success_count": report.success_count,
                    "skipped_count": len(report.skipped),
                    "failure_count": report.failure_count,
                    "error_count": len(report.errors),
                    "applied": report.applied,
                    "imported_identifiers": report.imported_identifiers,
                    "skipped": report.skipped,
                    "errors": report.errors,
                }
            return {
                "kind": kind,
                "parsed_count": len(parsed.records),
                "valid_count": len(validation.valid_records),
                "success_count": 0,
                "skipped_count": len(validation.skipped),
                "failure_count": len({(item.line_number, item.identifier) for item in validation.errors}),
                "error_count": len(validation.errors),
                "applied": False,
                "imported_identifiers": [],
                "skipped": validation.skipped,
                "errors": validation.errors,
            }

        if kind == "SCORE":
            parsed = self._import_service.parse_score_import_text(text)
            validation = self._import_service.validate_score_import_data(parsed)
            if apply:
                if not validation.valid_records:
                    raise ValueError("当前没有可导入的有效成绩记录，请先修正预检问题。")
                report = self._import_service.import_scores(validation)
                return {
                    "kind": kind,
                    "parsed_count": len(parsed.records),
                    "valid_count": len(validation.valid_records),
                    "success_count": report.success_count,
                    "skipped_count": len(report.skipped),
                    "failure_count": report.failure_count,
                    "error_count": len(report.errors),
                    "applied": report.applied,
                    "imported_identifiers": report.imported_identifiers,
                    "skipped": report.skipped,
                    "errors": report.errors,
                }
            return {
                "kind": kind,
                "parsed_count": len(parsed.records),
                "valid_count": len(validation.valid_records),
                "success_count": 0,
                "skipped_count": len(validation.skipped),
                "failure_count": len({(item.line_number, item.identifier) for item in validation.errors}),
                "error_count": len(validation.errors),
                "applied": False,
                "imported_identifiers": [],
                "skipped": validation.skipped,
                "errors": validation.errors,
            }

        raise ValueError(f"Unsupported import kind: {kind}")

    def _create_course_impl(self, payload: dict[str, Any]) -> Any:
        course = self._course_service.create_course(
            CourseCreateCommand(
                name=str(payload["name"]),
                semester=str(payload["semester"]),
                credit=str(payload["credit"]),
                status=CourseStatus(str(payload["status"]).upper()),
                score_type=ScoreType(str(payload["scoreType"]).upper())
                if payload.get("scoreType")
                else None,
                note=payload.get("note"),
            )
        )
        return self._get_course_view_payload(course.id)

    def _update_course_impl(self, payload: dict[str, Any]) -> Any:
        course = self._course_service.update_course(
            course_id=str(payload["courseId"]),
            command=CourseUpdateCommand(
                name=str(payload["name"]),
                semester=str(payload["semester"]),
                credit=str(payload["credit"]),
                status=CourseStatus(str(payload["status"]).upper()),
                score_type=ScoreType(str(payload["scoreType"]).upper())
                if payload.get("scoreType")
                else None,
                note=payload.get("note"),
            ),
        )
        return self._get_course_view_payload(course.id)

    def _delete_course_impl(self, course_id: str) -> dict[str, Any]:
        self._course_service.delete_course(course_id)
        return {"deleted": True, "course_id": course_id}

    def _record_score_impl(self, payload: dict[str, Any]) -> Any:
        score_type_value = payload.get("scoreType")
        score_record = self._score_service.record_score(
            course_id=str(payload["courseId"]),
            raw_score=str(payload["rawScore"]),
            score_type=ScoreType(str(score_type_value).upper()) if score_type_value else None,
        )
        return self._get_course_view_payload(score_record.course_id)

    def _clear_score_impl(self, payload: dict[str, Any]) -> Any:
        score_record = self._score_service.clear_score(str(payload["courseId"]))
        return self._get_course_view_payload(score_record.course_id)

    def _get_course_view_payload(self, course_id: str) -> Any:
        course = next((item for item in self._course_service.list_courses() if item.id == course_id), None)
        if course is None:
            raise ValueError("Course view not found after mutation.")
        return course

    def _get_planning_target_payload(self, target_id: str) -> dict[str, Any]:
        target = self._planning_target_repository.get(target_id)
        if target is None:
            raise ValueError("Planning target does not exist.")

        result = asdict(self._planning_service.get_target_result(target_id))
        scenarios = self._planning_scenario_repository.list_by_target_id(target_id)
        expectation_map = {
            scenario.id: self._expectation_repository.list_by_scenario_id(scenario.id)
            for scenario in scenarios
        }
        last_updated_at = target.created_at

        for scenario in result["scenarios"]:
            scenario_expectations = expectation_map.get(scenario["scenario_id"], [])
            scenario["expectations"] = [
                {
                    "course_id": expectation.course_id,
                    "raw_score": expectation.expected_score_raw,
                    "grade_point": expectation.expected_grade_point,
                }
                for expectation in scenario_expectations
            ]
            if scenario_expectations:
                scenario_last_updated_at = max(
                    expectation.updated_at for expectation in scenario_expectations
                )
                if scenario_last_updated_at > last_updated_at:
                    last_updated_at = scenario_last_updated_at

        result["last_updated_at"] = last_updated_at

        return result

    def _run_logged_operation(
        self,
        *,
        operation_type: str,
        object_type: str,
        object_summary: str,
        success_message: str,
        action: Callable[[], Any],
        details_builder: Callable[[Any], dict[str, Any]] | None = None,
    ) -> Any:
        try:
            result = action()
        except Exception as exc:
            self._safe_log_operation(
                operation_type=operation_type,
                object_type=object_type,
                object_summary=object_summary,
                status="FAILURE",
                message=str(exc),
            )
            raise

        self._safe_log_operation(
            operation_type=operation_type,
            object_type=object_type,
            object_summary=object_summary,
            status="SUCCESS",
            message=success_message,
            details=details_builder(result) if details_builder else None,
        )
        return result

    def _safe_log_operation(
        self,
        *,
        operation_type: str,
        object_type: str,
        object_summary: str,
        status: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        repository = getattr(self, "_operation_log_repository", None)
        if repository is None or self._connection is None:
            return

        try:
            repository.add(
                OperationLogEntry(
                    id=new_id(),
                    operation_type=operation_type,
                    object_type=object_type,
                    object_summary=object_summary,
                    status=status,
                    message=message,
                    created_at=datetime.now().astimezone(),
                    details_json=OperationLogRepository.encode_details(details),
                )
            )
        except Exception:
            return

    @staticmethod
    def _resolve_database_path(database_path: str | Path | None) -> Path:
        if database_path:
            return Path(database_path)

        env_path = os.getenv("GPA_MANAGER_DB_PATH")
        if env_path:
            return Path(env_path)

        return PROJECT_ROOT / "data" / "gpa_manager.sqlite3"

    @staticmethod
    def _remove_sqlite_sidecars(database_path: Path) -> None:
        for suffix in ("-wal", "-shm"):
            sidecar = Path(f"{database_path}{suffix}")
            if sidecar.exists():
                sidecar.unlink(missing_ok=True)

    @staticmethod
    def _normalize_file_label(value: Any) -> str:
        normalized = str(value or "").strip().lower().replace(" ", "-")
        return "".join(character for character in normalized if character.isalnum() or character in {"-", "_"})

    @staticmethod
    def _build_file_info(path: Path) -> dict[str, Any]:
        stat = path.stat()
        modified_at = datetime.fromtimestamp(stat.st_mtime).astimezone()
        return {
            "path": str(path.resolve()),
            "file_name": path.name,
            "created_at": modified_at,
            "size_bytes": stat.st_size,
        }


def dispatch(app: DesktopBridgeApp, command: str, payload: dict[str, Any]) -> Any:
    commands = {
        "snapshot": lambda: app.snapshot(),
        "app.info": lambda: app.get_app_info(),
        "system.health": lambda: app.get_startup_health(),
        "operation.logs": lambda: app.list_operation_logs(payload),
        "data.backup": lambda: app.create_database_backup(payload),
        "data.list_backups": lambda: app.list_database_backups(payload),
        "data.restore_backup": lambda: app.restore_database_backup(payload),
        "data.export": lambda: app.export_snapshot(payload),
        "planning.create_target": lambda: app.create_planning_target(payload),
        "planning.save_expectations": lambda: app.save_planning_expectations(payload),
        "import.run": lambda: app.run_import(payload),
        "course.create": lambda: app.create_course(payload),
        "course.update": lambda: app.update_course(payload),
        "course.delete": lambda: app.delete_course(payload),
        "score.record": lambda: app.record_score(payload),
        "score.clear": lambda: app.clear_score(payload),
    }

    if command not in commands:
        raise ValueError(f"Unsupported bridge command: {command}")

    return commands[command]()


def serialize_for_frontend(value: Any) -> Any:
    if is_dataclass(value):
        return serialize_for_frontend(asdict(value))
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_for_frontend(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            camel_key = "".join(
                part.capitalize() if index else part
                for index, part in enumerate(str(key).split("_"))
            )
            normalized[camel_key] = serialize_for_frontend(item)
        return normalized
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Desktop bridge for the offline GPA manager.")
    parser.add_argument("--command", required=True, help="Bridge command name, for example: snapshot")
    parser.add_argument("--payload", default="{}", help="JSON payload passed from the desktop frontend")
    parser.add_argument("--db", default=None, help="Optional SQLite database path")
    args = parser.parse_args()

    app: DesktopBridgeApp | None = None
    try:
        payload = json.loads(args.payload or "{}")
        app = DesktopBridgeApp(database_path=args.db)
        result = dispatch(app, args.command, payload)
        print(
            json.dumps(
                {"ok": True, "data": serialize_for_frontend(result)},
                ensure_ascii=False,
            )
        )
    except Exception as exc:  # pragma: no cover - bridge error path
        message = str(exc)
        if isinstance(exc, DatabaseMigrationError):
            message = f"数据库初始化失败：{exc}"
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": {
                        "message": message,
                        "code": exc.__class__.__name__,
                        "command": args.command,
                    },
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1) from exc
    finally:
        if app is not None:
            app.close()

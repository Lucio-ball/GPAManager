from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, is_dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any

from gpa_manager.db.connection import create_connection
from gpa_manager.db.schema import initialize_database
from gpa_manager.models.dto import (
    CourseCreateCommand,
    CourseUpdateCommand,
    PlanningTargetCreateCommand,
    ScenarioExpectationSaveCommand,
)
from gpa_manager.models.enums import CourseStatus, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
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

        self._connection = create_connection(resolved_database)
        initialize_database(self._connection)

        self._course_repository = CourseRepository(self._connection)
        self._score_repository = ScoreRepository(self._connection)
        self._planning_target_repository = PlanningTargetRepository(self._connection)
        self._planning_scenario_repository = PlanningScenarioRepository(self._connection)
        self._expectation_repository = ScenarioCourseExpectationRepository(self._connection)
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
            connection=self._connection,
            course_repository=self._course_repository,
            score_repository=self._score_repository,
            course_service=self._course_service,
            score_service=self._score_service,
            rule_engine=self._rule_engine,
        )

    def close(self) -> None:
        self._connection.close()

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

        return {
            "summary": summary,
            "courses": courses,
            "latest_planning": latest_target,
            "import_templates": {
                "course_text_example": (
                    "course_name=Operating Systems;semester=2025秋;credit=4.0;status=PLANNED;"
                    "score_type=PERCENTAGE;note=核心课\n"
                    "course_name=Computer Networks;semester=2025秋;credit=3.0;status=PLANNED;"
                    "score_type=PERCENTAGE"
                ),
                "score_text_example": (
                    "course_name=Advanced Mathematics;semester=2024秋;raw_score=92\n"
                    "course_name=College English;semester=2024秋;raw_score=88"
                ),
            },
        }

    def create_planning_target(self, payload: dict[str, Any]) -> Any:
        target_gpa = str(payload["targetGpa"])
        target = self._planning_service.create_target(PlanningTargetCreateCommand(target_gpa=target_gpa))
        return self._get_planning_target_payload(target.target_id)

    def save_planning_expectations(self, payload: dict[str, Any]) -> Any:
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

    def run_import(self, payload: dict[str, Any]) -> dict[str, Any]:
        kind = str(payload["kind"]).upper()
        text = str(payload.get("text", ""))
        apply = bool(payload.get("apply", False))

        if kind == "COURSE":
            parsed = self._import_service.parse_course_import_text(text)
            validation = self._import_service.validate_course_import_data(parsed)
            if apply:
                report = self._import_service.import_courses(validation)
                return {
                    "kind": kind,
                    "parsed_count": len(parsed.records),
                    "valid_count": len(validation.valid_records),
                    "skipped_count": len(report.skipped),
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
                "skipped_count": len(validation.skipped),
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
                report = self._import_service.import_scores(validation)
                return {
                    "kind": kind,
                    "parsed_count": len(parsed.records),
                    "valid_count": len(validation.valid_records),
                    "skipped_count": len(report.skipped),
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
                "skipped_count": len(validation.skipped),
                "error_count": len(validation.errors),
                "applied": False,
                "imported_identifiers": [],
                "skipped": validation.skipped,
                "errors": validation.errors,
            }

        raise ValueError(f"Unsupported import kind: {kind}")

    def create_course(self, payload: dict[str, Any]) -> Any:
        course = self._course_service.create_course(
            CourseCreateCommand(
                name=str(payload["name"]),
                semester=str(payload["semester"]),
                credit=str(payload["credit"]),
                status=CourseStatus(str(payload["status"]).upper()),
                score_type=ScoreType(str(payload["scoreType"]).upper()) if payload.get("scoreType") else None,
                note=payload.get("note"),
            )
        )
        return self._get_course_view_payload(course.id)

    def update_course(self, payload: dict[str, Any]) -> Any:
        course = self._course_service.update_course(
            course_id=str(payload["courseId"]),
            command=CourseUpdateCommand(
                name=str(payload["name"]),
                semester=str(payload["semester"]),
                credit=str(payload["credit"]),
                status=CourseStatus(str(payload["status"]).upper()),
                score_type=ScoreType(str(payload["scoreType"]).upper()) if payload.get("scoreType") else None,
                note=payload.get("note"),
            ),
        )
        return self._get_course_view_payload(course.id)

    def delete_course(self, payload: dict[str, Any]) -> dict[str, Any]:
        course_id = str(payload["courseId"])
        self._course_service.delete_course(course_id)
        return {"deleted": True, "course_id": course_id}

    def record_score(self, payload: dict[str, Any]) -> Any:
        score_type_value = payload.get("scoreType")
        score_record = self._score_service.record_score(
            course_id=str(payload["courseId"]),
            raw_score=str(payload["rawScore"]),
            score_type=ScoreType(str(score_type_value).upper()) if score_type_value else None,
        )
        return self._get_course_view_payload(score_record.course_id)

    def clear_score(self, payload: dict[str, Any]) -> Any:
        score_record = self._score_service.clear_score(str(payload["courseId"]))
        return self._get_course_view_payload(score_record.course_id)

    def _get_course_view_payload(self, course_id: str) -> Any:
        course = next((item for item in self._course_service.list_courses() if item.id == course_id), None)
        if course is None:
            raise ValueError("Course view not found after mutation.")
        return course

    def _get_planning_target_payload(self, target_id: str) -> dict[str, Any]:
        result = asdict(self._planning_service.get_target_result(target_id))
        expectation_map = {
            scenario.id: self._expectation_repository.list_by_scenario_id(scenario.id)
            for scenario in self._planning_scenario_repository.list_by_target_id(target_id)
        }

        for scenario in result["scenarios"]:
            scenario["expectations"] = [
                {
                    "course_id": expectation.course_id,
                    "raw_score": expectation.expected_score_raw,
                    "grade_point": expectation.expected_grade_point,
                }
                for expectation in expectation_map.get(scenario["scenario_id"], [])
            ]

        return result

    @staticmethod
    def _resolve_database_path(database_path: str | Path | None) -> Path:
        if database_path:
            return Path(database_path)

        env_path = os.getenv("GPA_MANAGER_DB_PATH")
        if env_path:
            return Path(env_path)

        return PROJECT_ROOT / "data" / "gpa_manager.sqlite3"


def dispatch(app: DesktopBridgeApp, command: str, payload: dict[str, Any]) -> Any:
    commands = {
        "snapshot": lambda: app.snapshot(),
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

    payload = json.loads(args.payload or "{}")
    app = DesktopBridgeApp(database_path=args.db)
    try:
        result = dispatch(app, args.command, payload)
        print(
            json.dumps(
                {"ok": True, "data": serialize_for_frontend(result)},
                ensure_ascii=False,
            )
        )
    except Exception as exc:  # pragma: no cover - bridge error path
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1) from exc
    finally:
        app.close()


if __name__ == "__main__":
    main()

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from gpa_manager.api.desktop_bridge import DesktopBridgeApp
from gpa_manager.db.connection import create_connection
from gpa_manager.db.schema import CURRENT_SCHEMA_VERSION, initialize_database


class DesktopBridgeStabilityTests(unittest.TestCase):
    def _create_app(self) -> tuple[tempfile.TemporaryDirectory[str], Path, DesktopBridgeApp]:
        temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(temp_dir.name) / "gpa_manager.sqlite3"
        app = DesktopBridgeApp(database_path=database_path)
        return temp_dir, database_path, app

    def test_legacy_database_is_migrated_and_self_checked(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            database_path = Path(temp_dir_name) / "gpa_manager.sqlite3"
            connection = create_connection(database_path)
            initialize_database(connection)
            connection.execute("DROP TABLE operation_logs")
            connection.execute("PRAGMA user_version = 0")
            connection.commit()
            connection.close()

            app = DesktopBridgeApp(database_path=database_path)
            try:
                app_info = app.get_app_info()
                self_check = app.get_startup_health()

                self.assertEqual(app_info["schema_version"], CURRENT_SCHEMA_VERSION)
                self.assertEqual(self_check.status, "PASS")
                self.assertTrue(self_check.items)
                self.assertTrue((database_path.parent / "backups").exists())
                self.assertTrue(
                    any(
                        backup.name.startswith("gpa-manager-pre-migration-v1-to-v2-")
                        for backup in (database_path.parent / "backups").glob("*.sqlite3")
                    )
                )
            finally:
                app.close()

    def test_course_mutations_are_written_to_operation_log(self) -> None:
        temp_dir, _database_path, app = self._create_app()
        try:
            payload = {
                "name": "Operating Systems",
                "semester": "2026春",
                "credit": "4.0",
                "status": "PLANNED",
                "scoreType": "PERCENTAGE",
                "note": "核心课",
            }

            app.create_course(payload)
            with self.assertRaises(Exception):
                app.create_course(payload)

            logs = app.list_operation_logs({"limit": 5})
            self.assertGreaterEqual(len(logs), 2)
            self.assertEqual(logs[0].operation_type, "course.create")
            self.assertEqual(logs[0].status, "FAILURE")
            self.assertEqual(logs[1].operation_type, "course.create")
            self.assertEqual(logs[1].status, "SUCCESS")
        finally:
            app.close()
            temp_dir.cleanup()

    def test_backup_can_be_restored_and_snapshot_refreshes(self) -> None:
        temp_dir, _database_path, app = self._create_app()
        try:
            app.create_course(
                {
                    "name": "Calculus",
                    "semester": "2025秋",
                    "credit": "4.0",
                    "status": "COMPLETED",
                    "scoreType": "PERCENTAGE",
                    "note": None,
                }
            )
            backup = app.create_database_backup({"label": "restore-test"})
            app.create_course(
                {
                    "name": "Linear Algebra",
                    "semester": "2026春",
                    "credit": "3.0",
                    "status": "PLANNED",
                    "scoreType": "PERCENTAGE",
                    "note": None,
                }
            )

            before_restore_courses = app.snapshot()["courses"]
            self.assertEqual(len(before_restore_courses), 2)

            restore_result = app.restore_database_backup(
                {"backupPath": backup["path"], "confirmed": True}
            )
            after_restore_courses = app.snapshot()["courses"]

            self.assertEqual(len(after_restore_courses), 1)
            self.assertEqual(after_restore_courses[0].name, "Calculus")
            self.assertEqual(
                restore_result["schema_version"],
                CURRENT_SCHEMA_VERSION,
            )
            self.assertTrue(Path(restore_result["safeguard_backup_path"]).exists())
        finally:
            app.close()
            temp_dir.cleanup()


if __name__ == "__main__":
    unittest.main()

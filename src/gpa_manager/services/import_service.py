from __future__ import annotations

from decimal import Decimal, InvalidOperation
import sqlite3

from gpa_manager.common.decimal_utils import quantize_storage, to_decimal
from gpa_manager.common.sqlite_utils import atomic
from gpa_manager.models.dto import (
    CourseImportRecord,
    CourseCreateCommand,
    ImportErrorDetail,
    ImportReport,
    ImportSkippedDetail,
    ImportValidationResult,
    ParsedImportBatch,
    ParsedImportRow,
    ScoreImportRecord,
)
from gpa_manager.models.entities import Course, ScoreRecord
from gpa_manager.models.enums import CourseStatus, ScoreType
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.base import RuleEngine
from gpa_manager.services.course_service import CourseService
from gpa_manager.services.score_service import ScoreService


class ImportService:
    """Batch import for structured plain text lines."""

    _COURSE_FIELDS = {"course_name", "semester", "credit", "status", "score_type", "note"}
    _COURSE_REQUIRED_FIELDS = {"course_name", "semester", "credit", "status"}
    _SCORE_FIELDS = {"course_name", "semester", "raw_score", "score_type"}
    _SCORE_REQUIRED_FIELDS = {"course_name", "semester", "raw_score"}

    def __init__(
        self,
        connection: sqlite3.Connection,
        course_repository: CourseRepository,
        score_repository: ScoreRepository,
        course_service: CourseService,
        score_service: ScoreService,
        rule_engine: RuleEngine,
    ) -> None:
        self._connection = connection
        self._course_repository = course_repository
        self._score_repository = score_repository
        self._course_service = course_service
        self._score_service = score_service
        self._rule_engine = rule_engine

    def parse_course_import_text(self, text: str) -> ParsedImportBatch:
        return self._parse_import_text(text)

    def parse_score_import_text(self, text: str) -> ParsedImportBatch:
        return self._parse_import_text(text)

    def validate_course_import_data(self, parsed_batch: ParsedImportBatch) -> ImportValidationResult[CourseImportRecord]:
        errors = list(parsed_batch.errors)
        skipped: list[ImportSkippedDetail] = []
        valid_records: list[CourseImportRecord] = []
        seen_records: dict[tuple[str, str], CourseImportRecord] = {}

        for row in parsed_batch.records:
            row_errors = self._collect_unknown_and_missing_fields(
                row,
                allowed_fields=self._COURSE_FIELDS,
                required_fields=self._COURSE_REQUIRED_FIELDS,
            )
            if row_errors:
                errors.extend(row_errors)
                continue

            status = self._parse_course_status(row)
            credit = self._parse_credit(row)
            score_type = self._parse_optional_score_type(row)
            if status is None or credit is None:
                if status is None:
                    errors.append(
                        ImportErrorDetail(
                            line_number=row.line_number,
                            identifier=self._row_identifier(row),
                            message="Invalid course status. Use COMPLETED or PLANNED.",
                        )
                    )
                if credit is None:
                    errors.append(
                        ImportErrorDetail(
                            line_number=row.line_number,
                            identifier=self._row_identifier(row),
                            message="Invalid credit. Credit must be a positive decimal number.",
                        )
                    )
                continue

            if "score_type" in row.fields and score_type is None:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=self._row_identifier(row),
                        message="Invalid score_type. Use PERCENTAGE or GRADE.",
                    )
                )
                continue

            record = CourseImportRecord(
                line_number=row.line_number,
                name=row.fields["course_name"].strip(),
                semester=row.fields["semester"].strip(),
                credit=credit,
                status=status,
                score_type=score_type,
                note=self._normalize_optional_field(row.fields.get("note")),
            )
            try:
                CourseService._validate_course_identity(record.name, record.semester)
            except Exception as exc:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=record.identifier,
                        message=str(exc),
                    )
                )
                continue
            identity = (record.name, record.semester)

            duplicate_record = seen_records.get(identity)
            if duplicate_record is not None:
                if self._course_records_equal(duplicate_record, record):
                    skipped.append(
                        ImportSkippedDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            reason=f"Same course already appeared on line {duplicate_record.line_number}.",
                        )
                    )
                else:
                    errors.append(
                        ImportErrorDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            message=f"Conflicts with another imported course on line {duplicate_record.line_number}.",
                        )
                    )
                continue

            existing_course = self._course_repository.find_by_name_and_semester(record.name, record.semester)
            if existing_course is not None:
                if self._course_matches_existing(record, existing_course):
                    skipped.append(
                        ImportSkippedDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            reason="Course already exists with the same data.",
                        )
                    )
                else:
                    errors.append(
                        ImportErrorDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            message="Course already exists with different field values.",
                        )
                    )
                continue

            seen_records[identity] = record
            valid_records.append(record)

        return ImportValidationResult(valid_records=valid_records, skipped=skipped, errors=errors)

    def validate_score_import_data(self, parsed_batch: ParsedImportBatch) -> ImportValidationResult[ScoreImportRecord]:
        errors = list(parsed_batch.errors)
        skipped: list[ImportSkippedDetail] = []
        valid_records: list[ScoreImportRecord] = []
        seen_records: dict[tuple[str, str], ScoreImportRecord] = {}

        for row in parsed_batch.records:
            row_errors = self._collect_unknown_and_missing_fields(
                row,
                allowed_fields=self._SCORE_FIELDS,
                required_fields=self._SCORE_REQUIRED_FIELDS,
            )
            if row_errors:
                errors.extend(row_errors)
                continue

            course_name = row.fields["course_name"].strip()
            semester = row.fields["semester"].strip()
            raw_score = row.fields["raw_score"].strip()
            input_score_type = self._parse_optional_score_type(row)
            if "score_type" in row.fields and input_score_type is None:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=f"{course_name} ({semester})",
                        message="Invalid score_type. Use PERCENTAGE or GRADE.",
                    )
                )
                continue

            course = self._course_repository.find_by_name_and_semester(course_name, semester)
            if course is None:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=f"{course_name} ({semester})",
                        message="Course does not exist. Import the course first.",
                    )
                )
                continue
            if course.status is not CourseStatus.COMPLETED:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=f"{course_name} ({semester})",
                        message="Cannot import a real score for a planned course.",
                    )
                )
                continue

            resolved_score_type = course.score_type or input_score_type
            if resolved_score_type is None:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=f"{course_name} ({semester})",
                        message="Score type is missing on both the course and the import row.",
                    )
                )
                continue
            if course.score_type is not None and input_score_type is not None and input_score_type is not course.score_type:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=f"{course_name} ({semester})",
                        message="Imported score_type conflicts with the existing course score_type.",
                    )
                )
                continue

            try:
                self._rule_engine.convert_to_grade_point(resolved_score_type, raw_score)
            except Exception as exc:
                errors.append(
                    ImportErrorDetail(
                        line_number=row.line_number,
                        identifier=f"{course_name} ({semester})",
                        message=f"Invalid score value: {exc}",
                    )
                )
                continue

            record = ScoreImportRecord(
                line_number=row.line_number,
                course_id=course.id,
                course_name=course_name,
                semester=semester,
                raw_score=raw_score,
                score_type=resolved_score_type,
            )
            identity = (record.course_name, record.semester)

            duplicate_record = seen_records.get(identity)
            if duplicate_record is not None:
                if self._score_records_equal(duplicate_record, record):
                    skipped.append(
                        ImportSkippedDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            reason=f"Same score already appeared on line {duplicate_record.line_number}.",
                        )
                    )
                else:
                    errors.append(
                        ImportErrorDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            message=f"Conflicts with another imported score on line {duplicate_record.line_number}.",
                        )
                    )
                continue

            existing_score = self._score_repository.get_by_course_id(course.id)
            if existing_score is not None and existing_score.has_score:
                if self._score_matches_existing(record, existing_score):
                    skipped.append(
                        ImportSkippedDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            reason="Score already exists with the same data.",
                        )
                    )
                else:
                    errors.append(
                        ImportErrorDetail(
                            line_number=row.line_number,
                            identifier=record.identifier,
                            message="Score already exists with a different value.",
                        )
                    )
                continue

            seen_records[identity] = record
            valid_records.append(record)

        return ImportValidationResult(valid_records=valid_records, skipped=skipped, errors=errors)

    def import_courses(self, validation_result: ImportValidationResult[CourseImportRecord]) -> ImportReport:
        return self._import_records(
            import_type="COURSE",
            validation_result=validation_result,
            importer=self._import_course_record,
        )

    def import_scores(self, validation_result: ImportValidationResult[ScoreImportRecord]) -> ImportReport:
        return self._import_records(
            import_type="SCORE",
            validation_result=validation_result,
            importer=self._import_score_record,
        )

    def generate_import_report(self, report: ImportReport) -> str:
        lines = [
            f"{report.import_type} import report",
            f"Applied: {'YES' if report.applied else 'NO'}",
            f"Success: {report.success_count}",
            f"Skipped: {report.skipped_count}",
            f"Failed: {report.failure_count}",
        ]

        if report.imported_identifiers:
            lines.append("Imported records:")
            lines.extend(f"  - {identifier}" for identifier in report.imported_identifiers)

        if report.skipped:
            lines.append("Skipped details:")
            lines.extend(
                f"  - line {item.line_number}: {item.identifier} -> {item.reason}"
                for item in report.skipped
            )

        if report.errors:
            lines.append("Error details:")
            lines.extend(
                f"  - line {item.line_number}: {item.identifier} -> {item.message}"
                for item in report.errors
            )

        return "\n".join(lines)

    def _parse_import_text(self, text: str) -> ParsedImportBatch:
        records: list[ParsedImportRow] = []
        errors: list[ImportErrorDetail] = []

        for line_number, raw_line in enumerate(text.splitlines(), start=1):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            fields: dict[str, str] = {}
            malformed = False
            for segment in (part.strip() for part in stripped.split(";") if part.strip()):
                if "=" not in segment:
                    errors.append(
                        ImportErrorDetail(
                            line_number=line_number,
                            identifier=stripped,
                            message="Malformed segment. Each field must use key=value.",
                        )
                    )
                    malformed = True
                    break

                key, value = segment.split("=", 1)
                normalized_key = key.strip().lower()
                if not normalized_key:
                    errors.append(
                        ImportErrorDetail(
                            line_number=line_number,
                            identifier=stripped,
                            message="Field name cannot be empty.",
                        )
                    )
                    malformed = True
                    break
                if normalized_key in fields:
                    errors.append(
                        ImportErrorDetail(
                            line_number=line_number,
                            identifier=stripped,
                            message=f"Duplicate field '{normalized_key}' in the same line.",
                        )
                    )
                    malformed = True
                    break
                fields[normalized_key] = value.strip()

            if malformed:
                continue

            records.append(ParsedImportRow(line_number=line_number, raw_line=stripped, fields=fields))

        return ParsedImportBatch(records=records, errors=errors)

    def _collect_unknown_and_missing_fields(
        self,
        row: ParsedImportRow,
        *,
        allowed_fields: set[str],
        required_fields: set[str],
    ) -> list[ImportErrorDetail]:
        row_errors: list[ImportErrorDetail] = []
        unknown_fields = sorted(set(row.fields) - allowed_fields)
        if unknown_fields:
            row_errors.append(
                ImportErrorDetail(
                    line_number=row.line_number,
                    identifier=self._row_identifier(row),
                    message=f"Unknown fields: {', '.join(unknown_fields)}.",
                )
            )

        missing_fields = [
            field_name
            for field_name in sorted(required_fields)
            if not row.fields.get(field_name, "").strip()
        ]
        if missing_fields:
            row_errors.append(
                ImportErrorDetail(
                    line_number=row.line_number,
                    identifier=self._row_identifier(row),
                    message=f"Missing required fields: {', '.join(missing_fields)}.",
                )
            )

        return row_errors

    @staticmethod
    def _row_identifier(row: ParsedImportRow) -> str:
        course_name = row.fields.get("course_name", "").strip()
        semester = row.fields.get("semester", "").strip()
        if course_name and semester:
            return f"{course_name} ({semester})"
        return row.raw_line

    @staticmethod
    def _normalize_optional_field(value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    def _parse_course_status(self, row: ParsedImportRow) -> CourseStatus | None:
        raw_value = row.fields.get("status", "").strip()
        try:
            return CourseStatus(raw_value)
        except ValueError:
            return None

    def _parse_optional_score_type(self, row: ParsedImportRow) -> ScoreType | None:
        raw_value = self._normalize_optional_field(row.fields.get("score_type"))
        if raw_value is None:
            return None
        try:
            return ScoreType(raw_value)
        except ValueError:
            return None

    @staticmethod
    def _parse_credit(row: ParsedImportRow) -> Decimal | None:
        try:
            credit = quantize_storage(to_decimal(row.fields["credit"]))
        except (InvalidOperation, ValueError, KeyError):
            return None
        return credit if credit > 0 else None

    @staticmethod
    def _course_records_equal(left: CourseImportRecord, right: CourseImportRecord) -> bool:
        return (
            left.name == right.name
            and left.semester == right.semester
            and left.credit == right.credit
            and left.status is right.status
            and left.score_type is right.score_type
            and left.note == right.note
        )

    @staticmethod
    def _course_matches_existing(record: CourseImportRecord, existing_course: Course) -> bool:
        return (
            record.name == existing_course.name
            and record.semester == existing_course.semester
            and record.credit == existing_course.credit
            and record.status is existing_course.status
            and record.score_type is existing_course.score_type
            and record.note == existing_course.note
        )

    @staticmethod
    def _score_records_equal(left: ScoreImportRecord, right: ScoreImportRecord) -> bool:
        return (
            left.course_name == right.course_name
            and left.semester == right.semester
            and left.raw_score == right.raw_score
            and left.score_type is right.score_type
        )

    def _score_matches_existing(self, record: ScoreImportRecord, existing_score: ScoreRecord) -> bool:
        course = self._course_repository.get(record.course_id)
        existing_score_type = course.score_type if course is not None else None
        return (
            existing_score.has_score
            and existing_score.raw_score == record.raw_score
            and existing_score_type is record.score_type
        )

    def _import_course_record(self, record: CourseImportRecord) -> str:
        course = self._course_service.create_course(
            CourseCreateCommand(
                name=record.name,
                semester=record.semester,
                credit=record.credit,
                status=record.status,
                score_type=record.score_type,
                note=record.note,
            )
        )
        return f"{course.name} ({course.semester})"

    def _import_score_record(self, record: ScoreImportRecord) -> str:
        self._score_service.record_score(
            course_id=record.course_id,
            raw_score=record.raw_score,
            score_type=record.score_type,
        )
        return record.identifier

    def _import_records(
        self,
        *,
        import_type: str,
        validation_result: ImportValidationResult[CourseImportRecord] | ImportValidationResult[ScoreImportRecord],
        importer,
    ) -> ImportReport:
        total_records = (
            len(validation_result.valid_records)
            + len(validation_result.skipped)
            + self._count_failed_entries(validation_result.errors)
        )
        if validation_result.errors:
            return ImportReport(
                import_type=import_type,
                total_records=total_records,
                success_count=0,
                failure_count=self._count_failed_entries(validation_result.errors),
                skipped_count=len(validation_result.skipped),
                applied=False,
                imported_identifiers=[],
                skipped=validation_result.skipped,
                errors=validation_result.errors,
            )

        imported_identifiers: list[str] = []
        try:
            with atomic(self._connection):
                for record in validation_result.valid_records:
                    imported_identifiers.append(importer(record))
        except Exception as exc:
            return ImportReport(
                import_type=import_type,
                total_records=total_records,
                success_count=0,
                failure_count=self._count_failed_entries(
                    [
                        ImportErrorDetail(
                            line_number=0,
                            identifier=import_type,
                            message=f"Unexpected import failure: {exc}",
                        )
                    ]
                ),
                skipped_count=len(validation_result.skipped),
                applied=False,
                imported_identifiers=[],
                skipped=validation_result.skipped,
                errors=[
                    ImportErrorDetail(
                        line_number=0,
                        identifier=import_type,
                        message=f"Unexpected import failure: {exc}",
                    )
                ],
            )

        return ImportReport(
            import_type=import_type,
            total_records=total_records,
            success_count=len(imported_identifiers),
            failure_count=0,
            skipped_count=len(validation_result.skipped),
            applied=True,
            imported_identifiers=imported_identifiers,
            skipped=validation_result.skipped,
            errors=[],
        )

    @staticmethod
    def _count_failed_entries(errors: list[ImportErrorDetail]) -> int:
        return len({(error.line_number, error.identifier) for error in errors})

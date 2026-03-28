from __future__ import annotations

import sys
from pathlib import Path
from tempfile import gettempdir

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from gpa_manager.db.connection import create_connection
from gpa_manager.db.schema import initialize_database
from gpa_manager.repositories.course_repository import CourseRepository
from gpa_manager.repositories.score_repository import ScoreRepository
from gpa_manager.rules.school_rules import SchoolRuleEngine
from gpa_manager.services.course_service import CourseService
from gpa_manager.services.gpa_service import GpaCalculationService
from gpa_manager.services.import_service import ImportService
from gpa_manager.services.score_service import ScoreService


def main() -> None:
    demo_db = Path(gettempdir()) / "gpa_manager_demo.sqlite3"
    if demo_db.exists():
        demo_db.unlink()

    connection = create_connection(demo_db)
    initialize_database(connection)

    course_repository = CourseRepository(connection)
    score_repository = ScoreRepository(connection)
    rule_engine = SchoolRuleEngine()

    course_service = CourseService(course_repository, score_repository, rule_engine)
    score_service = ScoreService(course_repository, score_repository, rule_engine)
    gpa_service = GpaCalculationService(course_repository, score_repository)
    import_service = ImportService(
        connection=connection,
        course_repository=course_repository,
        score_repository=score_repository,
        course_service=course_service,
        score_service=score_service,
        rule_engine=rule_engine,
    )

    course_import_text = """
# one line = one course, split fields with ';'
course_name=Advanced Math;semester=2025秋;credit=4.0;status=COMPLETED;score_type=PERCENTAGE;note=core
course_name=English;semester=2025秋;credit=2.0;status=COMPLETED;score_type=PERCENTAGE
course_name=Algorithms;semester=2026春;credit=3.0;status=PLANNED;score_type=PERCENTAGE
""".strip()

    score_import_text = """
# one line = one score, locate course by course_name + semester
course_name=Advanced Math;semester=2025秋;raw_score=92
course_name=English;semester=2025秋;raw_score=88
""".strip()

    print("Standard text import format")
    print("-" * 70)
    print("Course line: course_name=...;semester=...;credit=...;status=COMPLETED|PLANNED;score_type=PERCENTAGE|GRADE;note=...")
    print("Score line:  course_name=...;semester=...;raw_score=...;score_type=PERCENTAGE|GRADE")

    print("\nCourse import text")
    print("-" * 70)
    print(course_import_text)
    course_parsed = import_service.parse_course_import_text(course_import_text)
    course_validation = import_service.validate_course_import_data(course_parsed)
    course_report = import_service.import_courses(course_validation)
    print(import_service.generate_import_report(course_report))

    print("\nScore import text")
    print("-" * 70)
    print(score_import_text)
    score_parsed = import_service.parse_score_import_text(score_import_text)
    score_validation = import_service.validate_score_import_data(score_parsed)
    score_report = import_service.import_scores(score_validation)
    print(import_service.generate_import_report(score_report))

    print("\nCurrent courses")
    print("-" * 70)
    for item in course_service.list_courses():
        score_display = item.raw_score if item.has_score else "N/A"
        grade_point_display = f"{item.grade_point:.3f}" if item.grade_point is not None else "-"
        print(
            f"{item.name:<16} | semester={item.semester:<8} | credit={item.credit:<6} | "
            f"status={item.status.value:<9} | score={score_display:<5} | gp={grade_point_display}"
        )

    summary = gpa_service.calculate_current_gpa()
    print("\nCurrent GPA summary")
    print("-" * 70)
    print(f"current_gpa={summary.current_gpa}")
    print(f"counted_credit_sum={summary.counted_credit_sum}")
    print(f"counted_course_count={summary.counted_course_count}")
    print(f"quality_point_sum={summary.quality_point_sum}")

    connection.close()


if __name__ == "__main__":
    main()

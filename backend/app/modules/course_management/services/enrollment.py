"""Joining a course by its enrollment code."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.modules.course_management.domain.codes import normalize
from app.modules.course_management.repositories.models import Course, Enrollment
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import Account


def find_by_code(db, raw_code: str) -> Course:
    """A wrong code and a disabled code fail the same way, so the response never reveals a course."""
    course = db.scalar(select(Course).where(Course.code == normalize(raw_code)))
    if course is None or not course.code_enabled:
        raise DomainError("ENROLL_CODE_NOT_FOUND", 404)
    return course


def existing(db, account: Account, course: Course) -> Enrollment | None:
    return db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == course.id,
            Enrollment.account_id == account.id,
        )
    )


def enroll(db, account: Account, course: Course, display_name: str) -> tuple[Enrollment, bool]:
    """Idempotent: returns (enrollment, created_now); a repeat keeps the first display name."""
    found = existing(db, account, course)
    if found is not None:
        return found, False
    try:
        with db.begin_nested():
            enrollment = Enrollment(
                course_id=course.id, account_id=account.id, display_name=display_name
            )
            db.add(enrollment)
            db.flush()
        return enrollment, True
    except IntegrityError:
        # A concurrent join won the unique constraint; read its committed row instead.
        winner = existing(db, account, course)
        if winner is None:
            raise
        return winner, False

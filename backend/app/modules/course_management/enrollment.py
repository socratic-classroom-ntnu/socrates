"""Joining a course by its enrollment code."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.modules.course_management.codes import normalize
from app.modules.course_management.repositories import Course, Enrollment
from app.modules.identity_access import service as identity
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.storage import transaction


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
    """Idempotent: returns (enrollment, created_now); a repeat keeps the first display name.

    A guest joins only a course that allows guests; one already in stays in when it stops."""
    found = existing(db, account, course)
    if found is not None:
        return found, False
    if account.kind == "guest":
        require_guests_allowed(course)
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


def require_guests_allowed(course: Course) -> None:
    if not course.allow_guest:
        raise DomainError("GUEST_JOIN_DISABLED", 403)


def join_as_new_guest(db, course: Course, nickname: str, locale: str) -> tuple[str, dict]:
    """A new guest enrolled in the course, in the caller's transaction: if anything fails, there
    is no guest either. Returns the session token and the guest's account view."""
    require_guests_allowed(course)
    token, view = identity.create_guest(db, nickname, locale)
    enroll(db, db.get(Account, view["id"]), course, nickname)
    return token, view


def public_preview_limit(host: str) -> None:
    """Anonymous previews share one per-IP bucket, counted in its own transaction so a 404
    from the lookup that follows cannot roll the count back."""
    with transaction() as db:
        # Like the signed-in join, room for a whole class behind one address.
        enforce_rate_limit(db, f"public-join-ip:{host}", 100, 60, error_code="RATE_LIMITED")

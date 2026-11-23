"""The course owner's roster (the 學生 tab): every enrolled student with their 最近活動 and 活動進度.

最近活動 is worked out as on the live page (progress.py): for each of the student's attempts in the
course, the later of its last update and its last message, and the latest of those; attempts in
soft-deleted activities still count, being the student's answers all the same. 活動進度 counts the
completed attempts among the activities open or ended now, and never any other activity, so it is
never more than counted_activities.
"""

from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.course_management.contracts import ActivityTimes, status
from app.modules.course_management.repositories import Activity, Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.solo_activity.guest_records import student_kinds
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage

COUNTED_STATUSES = frozenset({"open", "ended"})


def _sort_key(student: dict[str, Any]) -> tuple[bool, float, float, str]:
    last = student["last_activity_at"]
    return (last is None, -(last or 0.0), student["joined_at"], student["enrollment_id"])


def roster_view(db: Session, account: Account, course_id: str, at: float) -> dict[str, Any]:
    course = db.get(Course, course_id)
    # Students, other teachers and strangers alike: the course does not exist for them.
    if course is None or course.owner_id != account.id:
        raise DomainError("COURSE_NOT_FOUND", 404)

    enrolled = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.course_id == course.id, Enrollment.account_id != course.owner_id)
            .order_by(Enrollment.created_at, Enrollment.id)
        )
    )
    kinds = student_kinds(db, enrolled, at)
    account_ids = [row.account_id for row in enrolled]
    emails: dict[str, str | None] = dict(
        db.execute(select(Account.id, Account.email).where(Account.id.in_(account_ids)))
        .tuples()
        .all()
    )

    activities = list(db.scalars(select(Activity).where(Activity.course_id == course.id)))
    counted = {
        a.id
        for a in activities
        if not a.deleted and status(cast(ActivityTimes, a), at) in COUNTED_STATUSES
    }
    attempts = list(
        db.scalars(
            select(SoloAttempt).where(
                SoloAttempt.activity_id.in_([a.id for a in activities]),
                SoloAttempt.account_id.in_(account_ids),
            )
        )
    )
    last_message: dict[str, float] = dict(
        db.execute(
            select(SoloMessage.attempt_id, func.max(SoloMessage.created_at))
            .where(SoloMessage.attempt_id.in_([row.id for row in attempts]))
            .group_by(SoloMessage.attempt_id)
        )
        .tuples()
        .all()
    )
    last_at: dict[str, float] = {}
    completed: dict[str, int] = {}
    for row in attempts:
        latest = max(row.updated_at, last_message.get(row.id) or row.updated_at)
        last_at[row.account_id] = max(latest, last_at.get(row.account_id, latest))
        if row.activity_id in counted and row.state == "completed":
            completed[row.account_id] = completed.get(row.account_id, 0) + 1

    students = []
    for enrollment in enrolled:
        kind = kinds[enrollment.id]
        students.append(
            {
                "enrollment_id": enrollment.id,
                "display_name": enrollment.display_name,
                **kind,
                "email": emails.get(enrollment.account_id)
                if kind["kind"] == "registered"
                else None,
                "joined_at": enrollment.created_at,
                "last_activity_at": last_at.get(enrollment.account_id),
                "completed_activities": completed.get(enrollment.account_id, 0),
            }
        )
    students.sort(key=_sort_key)

    count = {
        name: sum(1 for k in kinds.values() if k["kind"] == name)
        for name in ("registered", "guest", "expired_guest", "deleted")
    }
    return {
        "course_id": course.id,
        "course_name": course.name,
        "generated_at": at,
        "counted_activities": len(counted),
        "summary": {
            "total": len(enrolled),
            "registered": count["registered"],
            "guests": count["guest"],
            "expired_guests": count["expired_guest"],
            "deleted": count["deleted"],
        },
        "students": students,
    }

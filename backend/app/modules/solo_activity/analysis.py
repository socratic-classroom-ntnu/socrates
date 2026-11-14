"""T6 statistics: each student's confirmed viewpoint, for the course owner.

Only three fields of the latest summary the student confirmed (current_position, reason_summary,
relevant_conditions) and a count of confirmed scenarios leave this module. The first answer,
candidate and rejected summaries, the rest of the confirmed summary, principle labels,
observations and messages never do. Only attempts on the activity's current revision count:
numbers never mix revisions.
"""

from typing import cast

from sqlalchemy import select

from app.modules.course_management import service as activities
from app.modules.course_management.contracts import ActivityTimes, status
from app.modules.course_management.repositories import Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.solo_activity.repositories import SoloAttempt
from app.modules.solo_activity.guest_records import student_kinds
from app.modules.solo_activity.service import final_status


def _student_view(enrollment: Enrollment, row: SoloAttempt, kind: dict) -> dict:
    confirmed = [e for e in row.progress if e.get("confirmed_summary")]
    summary = confirmed[-1]["confirmed_summary"] if confirmed else {}
    return {
        "enrollment_id": enrollment.id,
        "display_name": enrollment.display_name,
        **kind,
        "confirmed_scenarios": len(confirmed),
        "current_position": summary.get("current_position", ""),
        "reason_summary": summary.get("reason_summary", ""),
        "relevant_conditions": list(summary.get("relevant_conditions") or []),
        "final_status": final_status(row),
    }


def analysis_view(db, account: Account, activity_id: str, at: float) -> dict:
    activity = activities.get_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    # Students, other teachers and strangers alike: the activity does not exist for them.
    if course is None or course.owner_id != account.id:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    revision = activities.current_revision(db, activity)

    enrolled = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.course_id == course.id, Enrollment.account_id != course.owner_id)
            .order_by(Enrollment.created_at, Enrollment.id)
        )
    )
    attempts = (
        {
            row.account_id: row
            for row in db.scalars(
                select(SoloAttempt).where(
                    SoloAttempt.activity_id == activity.id,
                    SoloAttempt.revision_id == revision.id,
                )
            )
        }
        if revision is not None
        else {}
    )
    started = [(e, attempts[e.account_id]) for e in enrolled if e.account_id in attempts]
    # Numbered over the whole course, not only those who started.
    kinds = student_kinds(db, enrolled, at)
    done = sum(1 for _, row in started if row.state == "completed")

    return {
        "activity_id": activity.id,
        "title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "status": status(cast(ActivityTimes, activity), at),
        "ends_at": activity.ends_at,
        "generated_at": at,
        "revision_id": revision.id if revision is not None else None,
        "summary": {
            "enrolled": len(enrolled),
            "started": len(started),
            "done": done,
            "in_progress": len(started) - done,
        },
        "students": [
            _student_view(enrollment, row, kinds[enrollment.id]) for enrollment, row in started
        ],
    }

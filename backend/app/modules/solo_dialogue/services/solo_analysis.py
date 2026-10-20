"""T6 statistics: confirmed stances per question, for the course owner.

Only option ids and two fields of the summary the student confirmed (reason_summary,
relevant_conditions) leave this module. The first reason, candidate and rejected summaries,
the rest of the confirmed summary, principle labels, observations and messages never do.
Only attempts on the activity's current revision count: numbers never mix revisions.
"""

from typing import cast

from sqlalchemy import select

from app.modules.course_management.domain.activity_status import ActivityTimes, status
from app.modules.course_management.repositories.models import Course, Enrollment
from app.modules.course_management.services import activities
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import Account
from app.modules.solo_dialogue.repositories.solo_models import SoloAttempt
from app.modules.solo_dialogue.services.solo_attempts import REVIEW_STATES


def _question_view(index: int, question: dict, answers: list[tuple[Enrollment, dict]]) -> dict:
    """answers: every started student's progress entry for this question (empty when unreached)."""
    options = {
        option["id"]: {
            "option_id": option["id"],
            "text": option["text"],
            "count": 0,
            "students": [],
        }
        for option in question.get("options", [])
    }
    confirmed = changed = comparable = 0
    for enrollment, entry in answers:
        initial, final = entry.get("option_id"), entry.get("final_option_id")
        if final is None:
            continue
        confirmed += 1
        both = initial is not None
        comparable += both
        changed += both and initial != final
        option = options.get(final)
        if option is None:
            continue
        summary = entry.get("confirmed_summary") or {}
        option["count"] += 1
        option["students"].append(
            {
                "enrollment_id": enrollment.id,
                "display_name": enrollment.display_name,
                "changed_from_option_id": initial if both and initial != final else None,
                "reason_summary": summary.get("reason_summary", ""),
                "relevant_conditions": list(summary.get("relevant_conditions") or []),
            }
        )
    return {
        "index": index,
        "question_id": question["id"],
        "title": question["title"],
        "confirmed": confirmed,
        "unconfirmed": len(answers) - confirmed,
        "changed": changed,
        "comparable": comparable,
        "options": list(options.values()),
    }


def analysis_view(db, account: Account, activity_id: str, at: float) -> dict:
    activity = activities.get_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    # Students, other teachers and strangers alike: the activity does not exist for them.
    if course is None or course.owner_id != account.id:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    revision = activities.current_revision(db, activity)
    content = revision.content if revision is not None else activity.draft
    questions = content.get("questions", [])

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
    done = sum(1 for _, row in started if row.state in REVIEW_STATES)

    question_views = []
    for index, question in enumerate(questions):
        answers: list[tuple[Enrollment, dict]] = []
        for enrollment, row in started:
            # Matched by question id, never by position in progress.
            entry: dict = next(
                (e for e in row.progress if e.get("question_id") == question["id"]), {}
            )
            answers.append((enrollment, entry))
        question_views.append(_question_view(index, question, answers))

    return {
        "activity_id": activity.id,
        "title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "status": status(cast(ActivityTimes, activity), at),
        "question_count": len(questions),
        "ends_at": activity.ends_at,
        "generated_at": at,
        "revision_id": revision.id if revision is not None else None,
        "summary": {
            "enrolled": len(enrolled),
            "started": len(started),
            "done": done,
            "in_progress": len(started) - done,
        },
        "questions": question_views,
    }

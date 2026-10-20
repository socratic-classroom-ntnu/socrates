"""T5 live progress: each enrolled student's status per question, for the course owner.

Statuses, turn counts and times only. Message text, observations, stances and summaries never
leave this module: the teacher sees confirmed viewpoints in statistics, not here.
"""

import time
from typing import cast

from sqlalchemy import func, select

from app.modules.course_management.domain.activity_status import ActivityTimes, status
from app.modules.course_management.repositories.models import Course, Enrollment
from app.modules.course_management.services import activities
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import Account
from app.modules.solo_dialogue.repositories.solo_models import SoloAttempt, SoloMessage
from app.modules.solo_dialogue.services.solo_attempts import REVIEW_STATES

# In progress and idle longer than this: the teacher may want to look over.
ATTENTION_SECONDS = 300
# The current question is settled in these states; every other state is still talking it over.
SETTLED_STATES = frozenset({"between_questions"}) | REVIEW_STATES


def now() -> float:
    """Server clock for attention; tests replace this, never the request."""
    return time.time()


def _cells(row: SoloAttempt | None, question_count: int) -> list[dict]:
    if row is None:
        return [{"status": "not_started", "turns": None}] * question_count
    cells: list[dict] = []
    for index in range(question_count):
        if index < row.question_index:
            cells.append({"status": "confirmed", "turns": None})
        elif index > row.question_index:
            cells.append({"status": "not_started", "turns": None})
        elif row.state in SETTLED_STATES:
            cells.append({"status": "confirmed", "turns": None})
        elif row.state == "confirming":
            cells.append({"status": "confirming", "turns": None})
        elif row.state == "choosing_stance":
            cells.append({"status": "choosing_stance", "turns": None})
        else:
            turns = row.progress[index].get("turn_index", 0) if index < len(row.progress) else 0
            cells.append({"status": "in_dialogue", "turns": turns})
    return cells


def progress_view(db, account: Account, activity_id: str, at: float) -> dict:
    activity = activities.get_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    # Students, other teachers and strangers alike: the activity does not exist for them.
    if course is None or course.owner_id != account.id:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    revision = activities.current_revision(db, activity)
    content = revision.content if revision is not None else activity.draft
    questions = content.get("questions", [])
    question_count = len(questions)

    enrolled = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.course_id == course.id, Enrollment.account_id != course.owner_id)
            .order_by(Enrollment.created_at, Enrollment.id)
        )
    )
    attempts = {
        row.account_id: row
        for row in db.scalars(select(SoloAttempt).where(SoloAttempt.activity_id == activity.id))
    }
    last_message = dict(
        db.execute(
            select(SoloMessage.attempt_id, func.max(SoloMessage.created_at))
            .join(SoloAttempt, SoloAttempt.id == SoloMessage.attempt_id)
            .where(SoloAttempt.activity_id == activity.id)
            .group_by(SoloMessage.attempt_id)
        ).all()
    )

    students = []
    unconfirmed = [0] * question_count
    for enrollment in enrolled:
        row = attempts.get(enrollment.account_id)
        cells = _cells(row, question_count)
        if row is None:
            overall, last_at = "not_started", None
        else:
            overall = "done" if row.state in REVIEW_STATES else "in_progress"
            last_at = max(row.updated_at, last_message.get(row.id) or row.updated_at)
            for index, cell in enumerate(cells):
                if cell["status"] != "confirmed":
                    unconfirmed[index] += 1
        students.append(
            {
                "enrollment_id": enrollment.id,
                "display_name": enrollment.display_name,
                "overall": overall,
                "cells": cells,
                "review_status": (
                    "in_progress"
                    if row is not None and row.state in REVIEW_STATES
                    else "not_started"
                ),
                "last_activity_at": last_at,
                "attention": (
                    overall == "in_progress"
                    and last_at is not None
                    and at - last_at > ATTENTION_SECONDS
                ),
            }
        )

    return {
        "activity_id": activity.id,
        "title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "status": status(cast(ActivityTimes, activity), at),
        "question_count": question_count,
        "ends_at": activity.ends_at,
        "generated_at": at,
        "questions": [
            {"index": index, "title": question["title"]} for index, question in enumerate(questions)
        ],
        "summary": {
            "enrolled": len(enrolled),
            "started": sum(1 for s in students if s["overall"] != "not_started"),
            "done": sum(1 for s in students if s["overall"] == "done"),
            "unconfirmed_by_question": unconfirmed,
            "attention": sum(1 for s in students if s["attention"]),
        },
        "students": students,
    }

"""T5 live progress: each enrolled student's status per scenario, for the course owner.

Statuses, turn counts and times only. Message text, observations, answers and summaries never
leave this module: the teacher sees confirmed viewpoints in statistics, not here.
"""

import time
from typing import cast

from sqlalchemy import func, select

from app.modules.course_management import service as activities
from app.modules.course_management.contracts import ActivityTimes, status
from app.modules.course_management.repositories import Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from app.modules.solo_activity.service import REVIEW_STATES, final_status, review_status

# In progress and idle longer than this: the teacher may want to look over.
ATTENTION_SECONDS = 300
# The current scenario is settled in these states; every other state is still talking it over.
SETTLED_STATES = frozenset({"between_scenarios"}) | REVIEW_STATES


def now() -> float:
    """Server clock for attention; tests replace this, never the request."""
    return time.time()


def _cells(row: SoloAttempt | None) -> list[dict]:
    """One cell per scenario of the student's sequence so far; none before starting."""
    if row is None:
        return []
    cells: list[dict] = []
    for index, entry in enumerate(row.progress):
        # A scenario that ran out of messages is not a confirmed one.
        done = "capped" if entry.get("status") == "capped" else "confirmed"
        if index < row.scenario_index:
            cells.append({"status": done, "turns": None})
        elif index > row.scenario_index:
            continue
        elif row.state in SETTLED_STATES:
            cells.append({"status": done, "turns": None})
        elif row.state == "confirming":
            cells.append({"status": "confirming", "turns": None})
        elif row.state == "answering":
            cells.append({"status": "answering", "turns": None})
        else:
            cells.append({"status": "in_dialogue", "turns": entry.get("turn_index", 0)})
    return cells


def progress_view(db, account: Account, activity_id: str, at: float) -> dict:
    activity = activities.get_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    # Students, other teachers and strangers alike: the activity does not exist for them.
    if course is None or course.owner_id != account.id:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)

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
    for enrollment in enrolled:
        row = attempts.get(enrollment.account_id)
        cells = _cells(row)
        if row is None:
            overall, last_at = "not_started", None
        else:
            overall = "done" if row.state == "completed" else "in_progress"
            last_at = max(row.updated_at, last_message.get(row.id) or row.updated_at)
        students.append(
            {
                "enrollment_id": enrollment.id,
                "display_name": enrollment.display_name,
                "overall": overall,
                "cells": cells,
                "review_status": review_status(row.state) if row is not None else "not_started",
                "final_status": final_status(row) if row is not None else None,
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
        "ends_at": activity.ends_at,
        "generated_at": at,
        "summary": {
            "enrolled": len(enrolled),
            "started": sum(1 for s in students if s["overall"] != "not_started"),
            "done": sum(1 for s in students if s["overall"] == "done"),
            "attention": sum(1 for s in students if s["attention"]),
        },
        "students": students,
    }

"""T5 live progress: each enrolled student's status per scenario, for the course owner.

Statuses, turn counts, times, and the metrics and marks computed from the tutor's flags
(metrics.py) with the ids of the messages behind them. Message text, observations, answers and
summaries never leave this module: the teacher sees confirmed viewpoints in statistics, not here.
"""

import time
from typing import cast

from sqlalchemy import func, select

from app.modules.course_management import service as activities
from app.modules.course_management.contracts import ActivityTimes, status
from app.modules.course_management.repositories import Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.solo_activity.guest_records import student_kinds
from app.modules.solo_activity.metrics import Judged, student_metrics
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


def _flag_metrics(db, activity_id: str) -> dict[str, dict]:
    """Each attempt's metrics from its judged student messages and its tutor turns."""
    judged: dict[str, list[Judged]] = {}
    shifts: dict[str, int] = {}
    tested: dict[str, bool] = {}
    rows = db.execute(
        select(
            SoloMessage.attempt_id,
            SoloMessage.id,
            SoloMessage.role,
            SoloMessage.flags,
            SoloMessage.observations,
        )
        .join(SoloAttempt, SoloAttempt.id == SoloMessage.attempt_id)
        .where(SoloAttempt.activity_id == activity_id)
        .order_by(SoloMessage.attempt_id, SoloMessage.seq)
    ).all()
    for attempt_id, message_id, role, flags, observations in rows:
        if role == "student" and flags:
            judged.setdefault(attempt_id, []).append({"message_id": message_id, "flags": flags})
        elif role == "tutor" and observations:
            shifts[attempt_id] = shifts.get(attempt_id, 0) + bool(
                observations.get("position_shifted")
            )
            tested[attempt_id] = tested.get(attempt_id, False) or bool(
                observations.get("reason_tested")
            )
    attempts = set(judged) | set(shifts)
    return {
        attempt_id: student_metrics(
            judged.get(attempt_id, []),
            position_shifts=shifts.get(attempt_id, 0),
            reason_tested=tested.get(attempt_id, False),
        )
        for attempt_id in attempts
    }


NO_METRICS = {"metrics": None, "marks": [], "mark_message_ids": []}


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

    flagged = _flag_metrics(db, activity.id)
    kinds = student_kinds(db, enrolled, at)
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
                **kinds[enrollment.id],
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
                **(flagged.get(row.id, NO_METRICS) if row is not None else NO_METRICS),
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

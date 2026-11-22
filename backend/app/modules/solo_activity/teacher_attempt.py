"""The course owner reads one student's whole conversation in an activity (read only).

Built from the student's own attempt view (service._attempt_view), but listing every field of the
teacher's classes: what is only the student's to act on is not copied over, a final summary the
student turned down twice is hidden, and each scenario carries the times of its 不太對 presses and
the message it starts at. The student's own reader and its view are not touched.

The system lines of the transcript (按「不太對」, 請確認觀點) are not built here: the page makes
them from ``rejected_at``, ``revise_hint`` and ``final_feedback``, so another view of the same
conversation can read it the same way.
"""

import time
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.course_management import service as activities
from app.modules.course_management.contracts import ActivityTimes, status
from app.modules.course_management.repositories import (
    Activity,
    ActivityRevision,
    Course,
    Enrollment,
)
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.solo_activity.guest_records import student_kinds
from app.modules.solo_activity.progress import _cells
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from app.modules.solo_activity.service import (
    _attempt_view,
    _state,
    review_status,
)

NOT_FOUND = ("ACTIVITY_NOT_FOUND", 404)
_SCENARIO_FIELDS = ("index", "id", "text", "change", "answer", "status", "confirmed_summary")


def now() -> float:
    """Server clock for the activity's status; tests replace this, never the request."""
    return time.time()


def _owned_course(db: Session, account: Account, activity_id: str) -> tuple[Activity, Course]:
    """Students, other teachers, strangers and the private 我的對話 courses alike: not found."""
    activity = activities.get_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    if course is None or course.owner_id != account.id or course.practice_account_id is not None:
        raise DomainError(*NOT_FOUND)
    return activity, course


def _student(db: Session, course: Course, enrollment_id: str) -> Enrollment:
    """An enrollment of this course that is not the owner's own."""
    found = db.scalar(
        select(Enrollment).where(
            Enrollment.id == enrollment_id,
            Enrollment.course_id == course.id,
            Enrollment.account_id != course.owner_id,
        )
    )
    if found is None:
        raise DomainError(*NOT_FOUND)
    return found


def _first_messages(messages: list[dict[str, Any]]) -> dict[int, str]:
    """The first message of each scenario; the sentence on a final summary belongs to the review."""
    first: dict[int, str] = {}
    for message in messages:
        if not message["final_feedback"]:
            first.setdefault(message["scenario_index"], message["id"])
    return first


def _after(messages: list[dict[str, Any]], after: str | None) -> list[dict[str, Any]]:
    """Those after the named message; a message that is not there gives all of them again."""
    ids = [message["id"] for message in messages]
    if after is None or after not in ids:
        return messages
    return messages[ids.index(after) + 1 :]


def _stances(db: Session, row: SoloAttempt, placed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Each placement with its stance's label in the attempt's own revision."""
    revision = db.get(ActivityRevision, row.revision_id)
    space = (revision.content or {}).get("stance_space") or [] if revision is not None else []
    labels = {stance["id"]: stance["label"] for stance in space}
    return [
        {**item, "label": labels[item["stance_id"]]}
        for item in placed
        if item["stance_id"] in labels
    ]


def _attempt(db: Session, row: SoloAttempt, at: float, after: str | None) -> dict[str, Any]:
    student = _attempt_view(db, row, at)
    state = _state(row)
    first = _first_messages(student["messages"])
    hidden = student["final_status"] == "unconfirmed"
    scenarios = [
        {
            **{key: scenario[key] for key in _SCENARIO_FIELDS},
            "rejected_at": list(state.progress[scenario["index"]].rejected_at),
            "first_message_id": first.get(scenario["index"]),
            "stances": _stances(db, row, state.progress[scenario["index"]].stances),
        }
        for scenario in student["scenarios"]
    ]
    return {
        "id": row.id,
        "state": student["state"],
        "scenario_index": student["scenario_index"],
        "scenarios": scenarios,
        "messages": _after(student["messages"], after),
        "candidate_summary": student["candidate_summary"],
        "revising": student["revising"],
        "final_summary": None if hidden else student["final_summary"],
        "final_status": student["final_status"],
        "final_revised": student["final_revised"],
        "review_status": review_status(row.state),
        "cells": _cells(row),
    }


def transcript_view(
    db: Session,
    account: Account,
    activity_id: str,
    enrollment_id: str,
    at: float,
    after: str | None = None,
) -> dict[str, Any]:
    activity, course = _owned_course(db, account, activity_id)
    enrollment = _student(db, course, enrollment_id)
    enrolled = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.course_id == course.id, Enrollment.account_id != course.owner_id)
            .order_by(Enrollment.created_at, Enrollment.id)
        )
    )
    row = db.scalar(
        select(SoloAttempt).where(
            SoloAttempt.activity_id == activity.id, SoloAttempt.account_id == enrollment.account_id
        )
    )
    last_at = None
    if row is not None:
        last_message = db.scalar(
            select(func.max(SoloMessage.created_at)).where(SoloMessage.attempt_id == row.id)
        )
        last_at = max(row.updated_at, last_message or row.updated_at)
    return {
        "activity": {
            "id": activity.id,
            "title": activity.title,
            "course_id": course.id,
            "course_name": course.name,
            "status": status(cast(ActivityTimes, activity), at),
        },
        "student": {
            "enrollment_id": enrollment.id,
            "display_name": enrollment.display_name,
            **student_kinds(db, enrolled, at)[enrollment.id],
            "last_activity_at": last_at,
        },
        "attempt": _attempt(db, row, at, after) if row is not None else None,
    }

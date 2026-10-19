"""Activity drafts, publishing into immutable revisions, the open window, and activity-QR joins.

The draft holds what the teacher typed (including a ``starts_at`` of ``None`` meaning "open on
publish"); the Activity columns ``starts_at``/``ends_at`` hold the live window and change only on
publish, start_now, or end_now. Students only ever see the current revision's content.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from copy import deepcopy
from typing import TYPE_CHECKING, cast
from uuid import uuid4

from sqlalchemy import select

from app.modules.course_management.domain.activity_status import (
    ActivityStatus,
    ActivityTimes,
    TeacherAction,
    status,
    teacher_actions,
)
from app.modules.course_management.repositories.models import Activity, ActivityRevision, Course
from app.modules.course_management.services import enrollment
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import Account

if TYPE_CHECKING:
    from app.modules.course_management.api.schemas import ActivityDetailsUpdate, ActivityDraft

# Fields a teacher may change without a new revision, and the course snapshot publish adds.
_OPERATIONAL = ("title", "starts_at", "ends_at")
_COURSE_SNAPSHOT = ("course_intro", "course_goals")


def now() -> float:
    """Server clock for every activity decision; tests replace this, never the request."""
    return time.time()


def _status(activity: Activity, at: float) -> ActivityStatus:
    # mypy without the SQLAlchemy plugin sees Mapped[...] columns, not the instance values.
    return status(cast(ActivityTimes, activity), at)


def get_activity(db, activity_id: str) -> Activity:
    """A soft-deleted activity is indistinguishable from a missing one."""
    activity = db.scalar(
        select(Activity).where(Activity.id == activity_id, Activity.deleted.is_(False))
    )
    if activity is None:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    return activity


def _lock_row(db, activity_id: str) -> Activity:
    """Row lock shared by update, publish and lock, so a first attempt and a republish serialize."""
    activity = db.scalar(
        select(Activity)
        .where(Activity.id == activity_id, Activity.deleted.is_(False))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if activity is None:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    return activity


def current_revision(db, activity: Activity) -> ActivityRevision | None:
    if activity.current_revision_id is None:
        return None
    return db.get(ActivityRevision, activity.current_revision_id, populate_existing=True)


def is_locked(db, activity: Activity) -> bool:
    revision = current_revision(db, activity)
    return revision is not None and revision.locked_at is not None


def actions_for(db, activity: Activity, at: float) -> list[TeacherAction]:
    return teacher_actions(_status(activity, at), is_locked(db, activity))


def require_action(db, activity: Activity, action: TeacherAction, at: float) -> None:
    if action not in actions_for(db, activity, at):
        if action == "update" and is_locked(db, activity):
            raise DomainError("ACTIVITY_LOCKED", 409)
        raise DomainError("ACTIVITY_ACTION_UNAVAILABLE", 409)


def create_draft(db, course: Course, data: ActivityDraft) -> Activity:
    activity = Activity(course_id=course.id, title=data.title, draft=data.model_dump())
    db.add(activity)
    db.flush()
    return activity


def update_draft(db, activity: Activity, data: ActivityDraft) -> Activity:
    row = _lock_row(db, activity.id)
    if is_locked(db, row):
        raise DomainError("ACTIVITY_LOCKED", 409)
    row.draft = data.model_dump()
    # Activity.title is what students see; a published activity's name only changes on
    # publish or update_details, never by saving an unpublished draft.
    if row.published_at is None:
        row.title = data.title
    row.updated_at = time.time()
    return row


def _content_hash(content: dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def publish(db, activity: Activity, at: float) -> ActivityRevision:
    row = _lock_row(db, activity.id)
    if is_locked(db, row):
        raise DomainError("ACTIVITY_LOCKED", 409)
    draft = row.draft
    starts_at = draft["starts_at"] if draft["starts_at"] is not None else at
    ends_at = draft["ends_at"]
    if ends_at <= starts_at or ends_at <= at:
        raise DomainError("ACTIVITY_TIME_INVALID", 422)
    course = db.get(Course, row.course_id)
    previous = current_revision(db, row)
    content = {**deepcopy(draft), "course_intro": course.intro, "course_goals": course.goals}
    revision = ActivityRevision(
        activity_id=row.id,
        number=(previous.number if previous else 0) + 1,
        content=content,
        content_hash=_content_hash(content),
    )
    db.add(revision)
    db.flush()
    row.current_revision_id = revision.id
    row.title = draft["title"]
    row.published_at = at
    row.starts_at = starts_at
    row.ends_at = ends_at
    row.updated_at = at
    return revision


def _lock_for(db, activity: Activity, action: TeacherAction, at: float) -> Activity:
    """Lock the row and check the action again: the caller checked a row read before the
    lock, and whoever held the lock may have started, ended or edited the activity."""
    row = _lock_row(db, activity.id)
    require_action(db, row, action, at)
    return row


def start_now(db, activity: Activity, at: float) -> Activity:
    row = _lock_for(db, activity, "start_now", at)
    # The draft follows the live window, or has_unpublished_changes would report a change.
    row.starts_at = at
    row.draft = {**row.draft, "starts_at": at}
    row.updated_at = at
    return row


def end_now(db, activity: Activity, at: float) -> Activity:
    row = _lock_for(db, activity, "end_now", at)
    row.ends_at = at
    row.draft = {**row.draft, "ends_at": at}
    row.updated_at = at
    return row


def update_details(db, activity: Activity, data: ActivityDetailsUpdate, at: float) -> Activity:
    """Rename or move the end time; allowed after locking because neither changes the questions."""
    row = _lock_row(db, activity.id)
    changes: dict = {}
    if "ends_at" in data.model_fields_set:
        ends_at = cast(float, data.ends_at)
        if ends_at <= at or (row.starts_at is not None and ends_at <= row.starts_at):
            raise DomainError("ACTIVITY_TIME_INVALID", 422)
        changes["ends_at"] = ends_at
    if "title" in data.model_fields_set:
        changes["title"] = data.title
    if "ends_at" in changes:
        row.ends_at = changes["ends_at"]
    if "title" in changes:
        row.title = changes["title"]
    # Reassign the whole dict: SQLAlchemy does not see in-place changes to a JSON column.
    row.draft = {**row.draft, **changes}
    row.updated_at = at
    return row


def delete(db, activity: Activity) -> None:
    """Soft delete: hide the activity everywhere but keep it and its revisions.

    M3 marks the activity's attempts and statistics deleted in this same transaction;
    course_management does not import solo_dialogue.
    """
    row = _lock_row(db, activity.id)
    row.deleted = True
    row.updated_at = time.time()


def has_unpublished_changes(db, activity: Activity) -> bool:
    """Whether the teacher's draft differs from what students currently get.

    Course intro/goals edited after publishing do not count: they belong to the course, and
    the revision keeps the snapshot taken when it was published.
    """
    revision = current_revision(db, activity)
    if revision is None:
        return False
    draft = activity.draft
    starts_at = draft["starts_at"] if draft["starts_at"] is not None else activity.starts_at
    live = (activity.title, activity.starts_at, activity.ends_at)
    if (draft["title"], starts_at, draft["ends_at"]) != live:
        return True
    planned = {k: v for k, v in draft.items() if k not in _OPERATIONAL}
    served = {k: v for k, v in revision.content.items() if k not in _OPERATIONAL + _COURSE_SNAPSHOT}
    return _content_hash(planned) != _content_hash(served)


def copy(db, activity: Activity) -> Activity:
    """A fresh draft with new question and option ids; the title is copied unchanged."""
    draft = deepcopy(activity.draft)
    for question in draft["questions"]:
        question["id"] = uuid4().hex
        for option in question["options"]:
            option["id"] = uuid4().hex
    duplicate = Activity(course_id=activity.course_id, title=activity.title, draft=draft)
    db.add(duplicate)
    db.flush()
    return duplicate


def lock_current_revision(db, activity_id: str) -> ActivityRevision:
    """Freeze the published content; M3 calls this in the same transaction as the first attempt."""
    row = _lock_row(db, activity_id)
    revision = current_revision(db, row)
    if revision is None:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    if revision.locked_at is None:
        revision.locked_at = time.time()
        db.flush()
    return revision


def teacher_view(db, activity: Activity, at: float) -> dict:
    published = activity.published_at is not None
    revision = current_revision(db, activity)
    return {
        "id": activity.id,
        "course_id": activity.course_id,
        "status": _status(activity, at),
        "locked": revision is not None and revision.locked_at is not None,
        "has_unpublished_changes": has_unpublished_changes(db, activity),
        "revision": revision.number if revision else None,
        "draft": activity.draft,
        "starts_at": activity.starts_at if published else activity.draft["starts_at"],
        "ends_at": activity.ends_at if published else activity.draft["ends_at"],
        "available_actions": actions_for(db, activity, at),
    }


def _course_activities(db, course: Course) -> list[Activity]:
    return list(
        db.scalars(
            select(Activity)
            .where(Activity.course_id == course.id, Activity.deleted.is_(False))
            .order_by(Activity.created_at, Activity.id)
        )
    )


def teacher_cards(db, course: Course, at: float) -> list[dict]:
    cards = []
    for activity in _course_activities(db, course):
        view = teacher_view(db, activity, at)
        cards.append(
            {
                "id": activity.id,
                "title": activity.draft["title"],
                "status": view["status"],
                "locked": view["locked"],
                "has_unpublished_changes": view["has_unpublished_changes"],
                "question_count": len(activity.draft["questions"]),
                "starts_at": view["starts_at"],
                "ends_at": view["ends_at"],
                "available_actions": view["available_actions"],
            }
        )
    return cards


def _published(db, activity: Activity) -> ActivityRevision:
    """Students may only see published activities; a draft is indistinguishable from missing."""
    revision = current_revision(db, activity)
    if activity.published_at is None or revision is None:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    return revision


def student_cards(db, course: Course, at: float) -> list[dict]:
    cards = []
    for activity in _course_activities(db, course):
        if activity.published_at is None:
            continue
        cards.append(_student_card(activity, _published(db, activity), _status(activity, at)))
    return sorted(cards, key=lambda card: (card["starts_at"], card["id"]))


def _student_card(activity: Activity, revision: ActivityRevision, current: ActivityStatus) -> dict:
    return {
        "id": activity.id,
        "title": activity.title,
        "status": current,
        "question_count": len(revision.content["questions"]),
        "starts_at": activity.starts_at,
        "ends_at": activity.ends_at,
    }


def course_summaries(db, course_ids: list[str], at: float) -> dict[str, dict]:
    """Home-card numbers for many courses at once: one activity query and one revision query.

    The highlight is the open activity ending soonest, else the next scheduled one, else the
    latest ended one; ties go to the smaller id. Drafts and deleted activities never count.
    """
    summaries: dict[str, dict] = {
        course_id: {
            "activity_count": 0,
            "open_activity_count": 0,
            "open_activity_title": None,
            "highlight": None,
        }
        for course_id in course_ids
    }
    if not course_ids:
        return summaries
    rows = db.scalars(
        select(Activity).where(Activity.course_id.in_(course_ids), Activity.deleted.is_(False))
    ).all()
    published: dict[str, list[tuple[ActivityStatus, Activity]]] = defaultdict(list)
    for activity in rows:
        summaries[activity.course_id]["activity_count"] += 1
        if activity.published_at is not None and activity.current_revision_id is not None:
            published[activity.course_id].append((_status(activity, at), activity))
    picks: dict[str, tuple[ActivityStatus, Activity]] = {}
    for course_id, items in published.items():
        opened = sorted((a for s, a in items if s == "open"), key=lambda a: (a.ends_at, a.id))
        scheduled = sorted(
            (a for s, a in items if s == "scheduled"), key=lambda a: (a.starts_at, a.id)
        )
        ended = sorted(
            (a for s, a in items if s == "ended"), key=lambda a: (-cast(float, a.ends_at), a.id)
        )
        summaries[course_id]["open_activity_count"] = len(opened)
        if opened:
            summaries[course_id]["open_activity_title"] = opened[0].title
            picks[course_id] = ("open", opened[0])
        elif scheduled:
            picks[course_id] = ("scheduled", scheduled[0])
        elif ended:
            picks[course_id] = ("ended", ended[0])
    if picks:
        revision_ids = [activity.current_revision_id for _, activity in picks.values()]
        revisions = {
            revision.id: revision
            for revision in db.scalars(
                select(ActivityRevision).where(ActivityRevision.id.in_(revision_ids))
            )
        }
        for course_id, (current, activity) in picks.items():
            revision = revisions[cast(str, activity.current_revision_id)]
            summaries[course_id]["highlight"] = _student_card(activity, revision, current)
    return summaries


def join_preview(db, account: Account, activity: Activity, at: float) -> dict:
    content = _published(db, activity).content
    course = db.get(Course, activity.course_id)
    return {
        "activity_id": activity.id,
        "title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "teacher_name": course.teacher_name,
        "question_count": len(content["questions"]),
        "starts_at": activity.starts_at,
        "ends_at": activity.ends_at,
        "status": _status(activity, at),
        "already_enrolled": enrollment.existing(db, account, course) is not None,
        "default_display_name": account.username,
    }


def public_course_name(db, activity_id: str) -> str:
    """Course name behind a published activity link; drafts and deleted ones are not found."""
    activity = get_activity(db, activity_id)
    _published(db, activity)
    course = db.get(Course, activity.course_id)
    return course.name


def join_by_activity(
    db, account: Account, activity: Activity, display_name: str, at: float
) -> dict:
    _published(db, activity)
    current: ActivityStatus = _status(activity, at)
    if current == "ended":
        raise DomainError("ACTIVITY_ENDED", 409)
    course = db.get(Course, activity.course_id)
    _, created = enrollment.enroll(db, account, course, display_name)
    return {"course_id": course.id, "activity_id": activity.id, "enrolled_now": created}

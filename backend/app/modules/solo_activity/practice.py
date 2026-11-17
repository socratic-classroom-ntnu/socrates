"""學生「我的對話」（spec §10 M10–M16）：從主流程題庫開對話，每位學生一門由系統帳號擁有的私人課程。

對話本身完全沿用單人作答（`service.start`、同一套狀態機與鐵則）；這裡只負責建私人課程與活動、
列出自己的對話、每日新對話上限，以及只讓註冊、驗證過的學生使用。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.ai_providers.service import resolve_owner_chain
from app.modules.course_management import service as courses
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import service
from app.modules.solo_activity.repositories import SoloAttempt

TUTOR_ROLE = "socratic_tutor"


def _require_student(account: Account) -> None:
    if account.account_role != "student":
        raise DomainError("ACCOUNT_ROLE_FORBIDDEN", 403)


def bank_view() -> list[dict]:
    return [item.model_dump() for item in courses.practice_bank()]


def _quota(used: int) -> dict:
    limit = courses.practice_daily_limit()
    return {"limit": limit, "used_today": used, "remaining": max(0, limit - used)}


def practice_list(db: Session, account: Account, at: float) -> dict:
    _require_student(account)
    course = courses.practice_course(db, account.id)
    activities = courses.practice_activities(db, course)
    attempts = (
        {
            row.activity_id: row
            for row in db.scalars(
                select(SoloAttempt).where(
                    SoloAttempt.account_id == account.id,
                    SoloAttempt.activity_id.in_([a.id for a in activities]),
                )
            )
        }
        if activities
        else {}
    )
    rows = []
    for activity in activities:
        attempt = attempts.get(activity.id)
        if attempt is None:
            continue
        item = courses.practice_bank_item(activity.bank_item_id or "")
        rows.append(
            {
                "activity_id": activity.id,
                "attempt_id": attempt.id,
                "topic_id": activity.bank_item_id or "",
                "title": courses.practice_display_title(item, activity.title),
                "body": activity.draft["scenario"],
                "category": item.category if item is not None else None,
                "status": "completed" if attempt.state == "completed" else "in_progress",
                "created_at": activity.created_at,
                "updated_at": attempt.updated_at,
            }
        )
    rows.sort(key=lambda row: float(row["updated_at"] or 0.0), reverse=True)
    return {"dialogues": rows, "quota": _quota(courses.practice_created_today(db, course, at))}


def start_practice(db: Session, account: Account, bank_item_id: str, at: float) -> dict:
    """Check everything before writing anything: no platform connection or an unknown topic
    creates nothing and costs nothing from the day's limit."""
    _require_student(account)
    item = courses.practice_bank_item(bank_item_id)
    if item is None:
        raise DomainError("PRACTICE_TOPIC_NOT_FOUND", 404)
    owner = courses.practice_owner(db)
    bindings, _ = resolve_owner_chain(db, owner.id, TUTOR_ROLE)
    if not bindings:
        raise DomainError("PRACTICE_UNAVAILABLE", 503)
    course = courses.ensure_practice_course(db, account, owner)
    activity = courses.create_practice_activity(db, course, item, at)
    attempt = service.start(db, account, activity.id, at)
    return {"activity_id": activity.id, "attempt_id": attempt["id"]}

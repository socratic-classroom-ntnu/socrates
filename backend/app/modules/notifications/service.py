import re
import time
from datetime import date

from sqlalchemy.orm import Session

from app.modules.identity_access.repositories import Account
from app.modules.notifications import repositories as repo
from app.modules.notifications.contracts import (
    ActivityNotice,
    AnnouncementInput,
    AnnouncementNotice,
    AnnouncementView,
    GuestExpiryNotice,
    MaintenanceWindow,
    Notification,
)
from app.modules.platform.errors import DomainError

DAY = 24 * 60 * 60
CLOCK_TIME = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]")
CALENDAR_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def _valid_date(value: str) -> bool:
    if not CALENDAR_DATE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _check_announcement(body: AnnouncementInput) -> None:
    day, start, end = body.maintenance_date, body.maintenance_start, body.maintenance_end
    if not body.title.strip() or not body.content.strip():
        raise DomainError("ANNOUNCEMENT_INVALID", 422)
    if not (day or start or end):
        return
    if not (
        day
        and start
        and end
        and _valid_date(day)
        and CLOCK_TIME.fullmatch(start)
        and CLOCK_TIME.fullmatch(end)
        and start < end
    ):
        raise DomainError("ANNOUNCEMENT_INVALID", 422)


def _announcement_view(row: repo.Announcement, username: str | None) -> AnnouncementView:
    return AnnouncementView(
        id=row.id,
        audience=row.audience,
        title=row.title,
        content=row.content,
        maintenance_date=row.maintenance_date,
        maintenance_start=row.maintenance_start,
        maintenance_end=row.maintenance_end,
        published_at=row.published_at,
        published_by=row.published_by,
        published_by_username=username,
    )


def publish(db: Session, actor: Account, body: AnnouncementInput) -> AnnouncementView:
    _check_announcement(body)
    row = repo.Announcement(
        audience=body.audience,
        title=body.title,
        content=body.content,
        maintenance_date=body.maintenance_date or None,
        maintenance_start=body.maintenance_start or None,
        maintenance_end=body.maintenance_end or None,
        published_by=actor.id,
    )
    repo.save_announcement(db, row)
    return _announcement_view(row, actor.username)


def list_announcements(db: Session) -> list[AnnouncementView]:
    # A deleted publisher's username is a placeholder (deleted-<id>); show no name, like feedback.
    return [
        _announcement_view(row, None if kind == "deleted" else username)
        for row, username, kind in repo.list_announcements(db)
    ]


def remove(db: Session, announcement_id: str) -> None:
    repo.delete_announcement(db, announcement_id)


def _guest_expiry(account: Account, now: float) -> float | None:
    ends = account.guest_expires_at
    if account.kind == "guest" and ends is not None and 0 < ends - now < DAY:
        return ends
    return None


def list_notifications(db: Session, account: Account) -> list[Notification]:
    now = time.time()
    reads = repo.read_keys(db, account.id)
    items: list[Notification] = []
    for row in repo.visible_announcements(db, account.account_role):
        key = f"announcement:{row.id}"
        read = (
            key in reads or row.published_at < account.created_at or row.published_by == account.id
        )
        maintenance = None
        if row.maintenance_date and row.maintenance_start and row.maintenance_end:
            maintenance = MaintenanceWindow(
                date=row.maintenance_date, start=row.maintenance_start, end=row.maintenance_end
            )
        items.append(
            AnnouncementNotice(
                id=key,
                title=row.title,
                content=row.content,
                time=row.published_at,
                read=read,
                pop_up=not read,
                maintenance=maintenance,
            )
        )
    if account.account_role == "student":
        expiry = _guest_expiry(account, now)
        if expiry is not None:
            items.append(
                GuestExpiryNotice(
                    id="guest_expiry",
                    title="Guest account expiring soon",
                    content="Register an account to keep your learning records.",
                    time=expiry - DAY,
                    read="guest_expiry" in reads,
                    pop_up=False,
                    guest_expires_at=expiry,
                )
            )
        for activity, course_name in repo.opened_activities(db, account.id, now):
            assert activity.starts_at is not None  # starts_at is constrained by the query
            key = f"activity:{activity.id}"
            items.append(
                ActivityNotice(
                    id=key,
                    title="New activity open",
                    content=f"{course_name} opened a new activity: {activity.title}.",
                    time=activity.starts_at,
                    read=key in reads,
                    pop_up=False,
                    course_name=course_name,
                    activity_id=activity.id,
                    activity_name=activity.title,
                )
            )
    return sorted(items, key=lambda item: (item.time, item.id), reverse=True)


def mark_read(db: Session, account: Account, key: str) -> None:
    kind, _, resource_id = key.partition(":")
    if kind == "announcement" and resource_id:
        if repo.visible_announcements(db, account.account_role, resource_id):
            repo.insert_read(db, account.id, key, resource_id)
        return
    if account.account_role != "student":
        return
    now = time.time()
    if (
        key == "guest_expiry"
        and _guest_expiry(account, now) is not None
        or kind == "activity"
        and resource_id
        and repo.opened_activities(db, account.id, now, resource_id)
    ):
        repo.insert_read(db, account.id, key, None)

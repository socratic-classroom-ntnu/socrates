import time
from collections.abc import Sequence
from uuid import uuid4

from sqlalchemy import Float, ForeignKey, String, Text, delete, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.modules.course_management.repositories import Activity, Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.notifications.contracts import Audience
from app.modules.platform.storage import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    audience: Mapped[Audience] = mapped_column(String(7))
    title: Mapped[str] = mapped_column(String(40))
    content: Mapped[str] = mapped_column(Text)
    maintenance_date: Mapped[str | None] = mapped_column(String(10))
    maintenance_start: Mapped[str | None] = mapped_column(String(5))
    maintenance_end: Mapped[str | None] = mapped_column(String(5))
    published_by: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"))
    published_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)


class NotificationRead(Base):
    __tablename__ = "notification_reads"

    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True
    )
    notification_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    announcement_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("announcements.id", ondelete="CASCADE"), index=True
    )
    read_at: Mapped[float] = mapped_column(Float)


def save_announcement(db: Session, announcement: Announcement) -> None:
    db.add(announcement)
    db.flush()


def list_announcements(db: Session) -> Sequence[tuple[Announcement, str]]:
    return (
        db.execute(
            select(Announcement, Account.username)
            .join(Account, Account.id == Announcement.published_by)
            .order_by(Announcement.published_at.desc(), Announcement.id.desc())
        )
        .tuples()
        .all()
    )


def visible_announcements(
    db: Session, role: str, announcement_id: str | None = None
) -> Sequence[Announcement]:
    query = select(Announcement).where(Announcement.audience.in_(("all", role)))
    if announcement_id is not None:
        # Serialize a read receipt with concurrent deletion.
        query = query.where(Announcement.id == announcement_id).with_for_update(read=True)
    return db.scalars(query).all()


def delete_announcement(db: Session, announcement_id: str) -> None:
    announcement = db.get(Announcement, announcement_id, with_for_update=True)
    if announcement is None:
        return
    # SQLite's test adapter does not enable cascades.
    db.execute(delete(NotificationRead).where(NotificationRead.announcement_id == announcement_id))
    db.delete(announcement)


def opened_activities(
    db: Session, account_id: str, now: float, activity_id: str | None = None
) -> Sequence[tuple[Activity, str]]:
    query = (
        select(Activity, Course.name)
        .join(Course, Course.id == Activity.course_id)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(
            Enrollment.account_id == account_id,
            Course.practice_account_id.is_(None),
            Activity.published_at.is_not(None),
            Activity.deleted.is_(False),
            Activity.starts_at <= now,
            Activity.starts_at < Activity.ends_at,
            Activity.starts_at >= Enrollment.created_at,
        )
    )
    if activity_id is not None:
        query = query.where(Activity.id == activity_id)
    return db.execute(query).tuples().all()


def read_keys(db: Session, account_id: str) -> set[str]:
    return set(
        db.scalars(
            select(NotificationRead.notification_id).where(
                NotificationRead.account_id == account_id
            )
        )
    )


def insert_read(db: Session, account_id: str, key: str, announcement_id: str | None) -> None:
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(
        insert(NotificationRead)
        .values(
            account_id=account_id,
            notification_id=key,
            announcement_id=announcement_id,
            read_at=time.time(),
        )
        .on_conflict_do_nothing(index_elements=["account_id", "notification_id"])
    )


def lock_account(db: Session, account_id: str) -> None:
    db.scalar(select(Account.id).where(Account.id == account_id).with_for_update())


def transfer_guest_reads(db: Session, guest_id: str, account_id: str) -> None:
    # Keep referenced announcements alive until the copy commits. A concurrent deletion that
    # got the lock first removes its receipts before the copy reads them.
    db.scalars(
        select(Announcement.id)
        .join(NotificationRead, NotificationRead.announcement_id == Announcement.id)
        .where(NotificationRead.account_id == guest_id)
        .order_by(Announcement.id)
        .with_for_update(read=True, of=Announcement)
    ).all()
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(
        insert(NotificationRead)
        .from_select(
            ["account_id", "notification_id", "announcement_id", "read_at"],
            select(
                literal(account_id),
                NotificationRead.notification_id,
                NotificationRead.announcement_id,
                NotificationRead.read_at,
            ).where(NotificationRead.account_id == guest_id),
        )
        .on_conflict_do_nothing(index_elements=["account_id", "notification_id"])
    )
    db.execute(delete(NotificationRead).where(NotificationRead.account_id == guest_id))

"""PostgreSQL durable state and exact transaction boundary.

Room row locks serialize a room's commands; separate rooms progress concurrently.
An event identifier is notified in the same transaction as its persistent event.
SQLite is solely a unit-test adapter; production uses PostgreSQL.
"""

from typing import Any
import hashlib
import json
import os
import time
from contextlib import contextmanager
from uuid import uuid4
from sqlalchemy import (
    ForeignKey,
    JSON,
    Boolean,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "r2_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class LoginSession(Base):
    __tablename__ = "r2_login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_accounts.id"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[float] = mapped_column(Float, index=True)


class EmailToken(Base):
    __tablename__ = "r2_email_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_accounts.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(16))
    expires_at: Mapped[float] = mapped_column(Float)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)


class Mail(Base):
    __tablename__ = "r2_mail_outbox"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    recipient: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(20), default="PENDING")
    next_at: Mapped[float] = mapped_column(Float, default=time.time)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class Script(Base):
    __tablename__ = "r2_scripts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_accounts.id"), index=True)
    document: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class Snapshot(Base):
    __tablename__ = "r2_script_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    script_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_scripts.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))


class Room(Base):
    __tablename__ = "r2_classroom_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_accounts.id"), index=True)
    script_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_scripts.id"))
    snapshot_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("r2_script_snapshots.id"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(12), unique=True)
    state: Mapped[dict] = mapped_column(JSON)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    llm_used: Mapped[int] = mapped_column(Integer, default=0)


class Membership(Base):
    __tablename__ = "r2_memberships"
    __table_args__ = (
        UniqueConstraint("room_id", "account_id", "role"),
        UniqueConstraint("room_id", "seat"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_accounts.id"), index=True)
    role: Mapped[str] = mapped_column(String(12))
    alias: Mapped[str] = mapped_column(String(40))
    avatar: Mapped[str] = mapped_column(String(64))
    seat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_seen: Mapped[float] = mapped_column(Float, default=time.time)


class Event(Base):
    __tablename__ = "r2_classroom_events"
    __table_args__ = (UniqueConstraint("room_id", "seq"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class ActionReceipt(Base):
    __tablename__ = "r2_action_receipts"
    __table_args__ = (UniqueConstraint("room_id", "actor_id", "action_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    actor_id: Mapped[str] = mapped_column(String(36))
    action_id: Mapped[str] = mapped_column(String(100))
    payload_hash: Mapped[str] = mapped_column(String(64))
    receipt: Mapped[dict] = mapped_column(JSON)


class Answer(Base):
    __tablename__ = "r2_question_answers"
    __table_args__ = (UniqueConstraint("question_run_id", "membership_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    question_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_question_runs.id"))
    membership_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_memberships.id"))
    body: Mapped[dict] = mapped_column(JSON)


class QuestionRecord(Base):
    __tablename__ = "r2_question_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    question_index: Mapped[int] = mapped_column(Integer)
    definition: Mapped[dict] = mapped_column(JSON)
    state: Mapped[dict] = mapped_column(JSON)


class Job(Base):
    __tablename__ = "r2_llm_jobs"
    __table_args__ = (UniqueConstraint("room_id", "logical_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    logical_key: Mapped[str] = mapped_column(String(150))
    kind: Mapped[str] = mapped_column(String(40))
    context: Mapped[dict] = mapped_column(JSON)
    priority: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    next_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    lease: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    audit: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Budget(Base):
    __tablename__ = "r2_llm_budget"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    calls: Mapped[int] = mapped_column(Integer, default=0)


class Program(Base):
    __tablename__ = "r2_prompt_programs"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    metadata_json: Mapped[dict] = mapped_column(JSON)


class CallAudit(Base):
    __tablename__ = "r2_llm_call_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_llm_jobs.id"), index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class PointEntry(Base):
    __tablename__ = "r2_point_ledger"
    __table_args__ = (UniqueConstraint("room_id", "action_id", "account_id", "side"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_classroom_runs.id"), index=True)
    action_id: Mapped[str] = mapped_column(String(100))
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_accounts.id"), index=True)
    member_id: Mapped[str] = mapped_column(String(36), ForeignKey("r2_memberships.id"))
    focus_id: Mapped[str] = mapped_column(String(36))
    turn_index: Mapped[int] = mapped_column(Integer)
    side: Mapped[str] = mapped_column(String(12))
    amount: Mapped[int] = mapped_column(Integer)


class RateBucket(Base):
    __tablename__ = "r2_rate_buckets"
    id: Mapped[str] = mapped_column(String(150), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[float] = mapped_column(Float, index=True)


_ENGINE: Any = None
_FACTORY: Any = None


def configure(url: str | None = None, *, create: bool = False):
    global _ENGINE, _FACTORY
    from_environment = os.environ.get(
        "RUN2_DATABASE_URL",
        os.environ.get("DATABASE_URL", "postgresql+psycopg://socrates@localhost/socrates"),
    )
    resolved = url if url else from_environment
    kw: dict[str, Any] = {"pool_pre_ping": True}
    if resolved.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        kw.update(connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        kw.update(pool_size=5, max_overflow=5, pool_timeout=10)
    _ENGINE = create_engine(resolved, **kw)
    _FACTORY = sessionmaker(_ENGINE, expire_on_commit=False)
    if create:
        Base.metadata.create_all(_ENGINE)
    return _ENGINE


def engine():
    if _ENGINE is None:
        configure()
    return _ENGINE


@contextmanager
def transaction():
    engine()
    with _FACTORY.begin() as s:
        yield s


def digest(value) -> str:
    raw = (
        value
        if isinstance(value, str)
        else json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def notify(db, payload: dict, channel="socrates_run2"):
    if db.bind.dialect.name == "postgresql":
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(body.encode()) > 7400:
            raise ValueError("notification envelope budget")
        db.execute(
            text("SELECT pg_notify(:channel,:payload)"), {"channel": channel, "payload": body}
        )


def append_event(db, room, event):
    room.seq += 1
    row = Event(
        id=str(uuid4()), room_id=room.id, seq=room.seq, type=event["type"], payload=event["payload"]
    )
    db.add(row)
    db.flush()
    notify(db, {"room": room.id, "event_id": row.id, "seq": row.seq})


def persist_machine(db, room, machine):
    room.state = machine.s
    room.due_at = machine.s.get("due_at")
    for e in machine.events:
        append_event(db, room, e)
    priority = {
        "focused_tutor": 1,
        "dynamic_question": 2,
        "question_summary": 3,
        "class_summary": 4,
        "personal_summary": 5,
    }
    for item in machine.jobs:
        found = db.scalar(select(Job).where(Job.room_id == room.id, Job.logical_key == item["key"]))
        if found is None:
            db.add(
                Job(
                    room_id=room.id,
                    logical_key=item["key"],
                    kind=item["kind"],
                    context=item["context"],
                    priority=priority[item["kind"]],
                )
            )
    for index, run in enumerate(machine.s.get("runs", [])):
        row = db.get(QuestionRecord, run["id"])
        if row is None:
            row = QuestionRecord(
                id=run["id"],
                room_id=room.id,
                question_index=index,
                definition=machine.s["questions"][index],
                state=deepcopy_json(run),
            )
            db.add(row)
        else:
            row.state = deepcopy_json(run)
        for m, a in run["answers"].items():
            row = db.scalar(
                select(Answer).where(Answer.question_run_id == run["id"], Answer.membership_id == m)
            )
            if row is None:
                db.add(Answer(room_id=room.id, question_run_id=run["id"], membership_id=m, body=a))
    db.flush()


def deepcopy_json(value):
    return json.loads(json.dumps(value))

import time
from uuid import uuid4
from sqlalchemy import (
    ForeignKey,
    JSON,
    Float,
    Integer,
    String,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.modules.platform.storage import Base, deepcopy_json, notify
from app.modules.llm_runtime.repositories import Job

from typing import Any


class Room(Base):
    __tablename__ = "classroom_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    script_id: Mapped[str] = mapped_column(String(36), ForeignKey("scripts.id"))
    snapshot_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("script_snapshots.id"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(12), unique=True)
    state: Mapped[dict] = mapped_column(JSON)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    llm_used: Mapped[int] = mapped_column(Integer, default=0)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("room_id", "account_id", "role"),
        UniqueConstraint("room_id", "seat"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    role: Mapped[str] = mapped_column(String(12))
    # 教師的 alias 取自 username，註冊契約允許到 64 字（見 0007 migration）。
    alias: Mapped[str] = mapped_column(String(64))
    avatar: Mapped[str] = mapped_column(String(64))
    seat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_seen: Mapped[float] = mapped_column(Float, default=time.time)


def next_seat(db: Any, room_id: str, members: dict[str, Any]) -> int:
    """下一個空座位：取資料庫與 room.state 兩邊已用座位的最大值加一。

    座位有 (room_id, seat) 唯一約束；成員被移除（例如清除 AI 學生）後人數會變少，
    用「目前人數」當座位號會撞到還在的成員，所以一律取最大值加一。
    """
    used = [m.get("seat") for m in members.values() if isinstance(m.get("seat"), int)]
    stored = db.scalar(select(func.max(Membership.seat)).where(Membership.room_id == room_id))
    if isinstance(stored, int):
        used.append(stored)
    return max(used, default=-1) + 1


class Event(Base):
    __tablename__ = "classroom_events"
    __table_args__ = (UniqueConstraint("room_id", "seq"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class ActionReceipt(Base):
    __tablename__ = "action_receipts"
    __table_args__ = (UniqueConstraint("room_id", "actor_id", "action_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    actor_id: Mapped[str] = mapped_column(String(36))
    action_id: Mapped[str] = mapped_column(String(100))
    payload_hash: Mapped[str] = mapped_column(String(64))
    receipt: Mapped[dict] = mapped_column(JSON)


class Answer(Base):
    __tablename__ = "question_answers"
    __table_args__ = (UniqueConstraint("question_run_id", "membership_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    question_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_runs.id"))
    membership_id: Mapped[str] = mapped_column(String(36), ForeignKey("memberships.id"))
    body: Mapped[dict] = mapped_column(JSON)


class QuestionRecord(Base):
    __tablename__ = "question_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    question_index: Mapped[int] = mapped_column(Integer)
    definition: Mapped[dict] = mapped_column(JSON)
    state: Mapped[dict] = mapped_column(JSON)


class PointEntry(Base):
    __tablename__ = "point_ledger"
    __table_args__ = (UniqueConstraint("room_id", "action_id", "account_id", "side"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    action_id: Mapped[str] = mapped_column(String(100))
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    member_id: Mapped[str] = mapped_column(String(36), ForeignKey("memberships.id"))
    focus_id: Mapped[str] = mapped_column(String(36))
    turn_index: Mapped[int] = mapped_column(Integer)
    side: Mapped[str] = mapped_column(String(12))
    amount: Mapped[int] = mapped_column(Integer)


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
        "llm_student_turn": 0,
        "focused_tutor": 1,
        "personal_tutor": 1,
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


class ClassroomAssets(Base):
    __tablename__ = "classroom_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    assets: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class SessionLink(Base):
    __tablename__ = "classroom_sessions"

    room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classroom_runs.id"), primary_key=True
    )
    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classroom_assets.id"), index=True
    )
    batch_id: Mapped[str] = mapped_column(String(36), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)

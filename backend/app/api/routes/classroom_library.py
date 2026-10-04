"""Long-lived teacher Classroom assets, immutable Lessons, and linked Group Sessions."""

from copy import deepcopy
import time
from uuid import UUID, uuid5

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Float, ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from . import service
from .orchestrator import DomainError
from .portal_ai_students import ensure_other_options
from .storage import (
    Account,
    Base,
    Room,
    Script,
    Snapshot,
    digest,
    transaction,
)


class ClassroomAssets(Base):
    __tablename__ = "classroom_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    assets: Mapped[dict] = mapped_column(JSON, default=dict)
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


class LibraryReceipt(Base):
    __tablename__ = "library_receipts"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)


class Mutation(BaseModel):
    action_id: str = Field(min_length=8, max_length=100)


class CreateClassroom(Mutation):
    title: str = Field(min_length=1, max_length=160)


class AttachScript(Mutation):
    script_id: str | None = None
    document: dict | None = None


class CreateBatch(Mutation):
    script_id: str


router = APIRouter(prefix="/library")


def user(db, request, mutation=False):
    from .api import account

    return account(db, request, mutation)[0]


def owned(db, cid, account, lock=False):
    query = select(ClassroomAssets).where(ClassroomAssets.id == cid)
    if lock:
        query = query.with_for_update()
    classroom = db.scalar(query)
    if classroom is None or classroom.owner_id != account.id:
        raise DomainError("CLASSROOM_ASSET_OWNER_REQUIRED", 403)
    return classroom


def mutate(db, account, operation, body, action):
    key = f"{account.id}:{operation}:{body.action_id}"
    if len(key) > 200:
        raise DomainError("ACTION_SCOPE_REQUIRED", 422)
    hashed = digest(body.model_dump())
    old = db.get(LibraryReceipt, key)
    if old:
        if old.payload_hash != hashed:
            raise DomainError("ACTION_ID_PAYLOAD_CONFLICT", 409)
        return old.response
    result = action()
    db.add(LibraryReceipt(key=key, payload_hash=hashed, response=result))
    db.flush()
    return result


def _lesson_kind(state: dict) -> str:
    actor_types = {
        member.get("actor_type", "human") for member in state.get("members", {}).values()
    }
    if actor_types == {"llm_student"}:
        return "AI_SIMULATION"
    if "llm_student" in actor_types:
        return "MIXED"
    return "HUMAN"


def _lesson_projection(db, classroom_id: str) -> list[dict]:
    links = db.scalars(
        select(SessionLink)
        .where(
            SessionLink.classroom_id == classroom_id,
            SessionLink.kind == "BATCH",
        )
        .order_by(SessionLink.created_at.desc())
    ).all()
    all_links = db.scalars(
        select(SessionLink).where(SessionLink.classroom_id == classroom_id)
    ).all()
    group_counts: dict[str, int] = {}
    for link in all_links:
        if link.kind == "SESSION":
            group_counts[link.batch_id] = group_counts.get(link.batch_id, 0) + 1

    lessons = []
    for link in links:
        room = db.get(Room, link.room_id)
        if room is None:
            continue
        snapshot = db.get(Snapshot, room.snapshot_id) if room.snapshot_id else None
        document = snapshot.document if snapshot else {}
        questions = document.get("questions", [])
        lessons.append(
            {
                "lesson_id": link.batch_id,
                "batch_id": link.batch_id,
                "room_id": room.id,
                "snapshot_id": snapshot.id if snapshot else None,
                "snapshot_revision": snapshot.revision if snapshot else None,
                "snapshot_sha256": snapshot.content_hash if snapshot else None,
                "title": document.get("title") or room.state.get("title", "Lesson"),
                "question_count": len(questions),
                "lesson_kind": _lesson_kind(room.state),
                "group_count": group_counts.get(link.batch_id, 0),
                "phase": room.state.get("phase"),
                "created_at": link.created_at,
                "source": "immutable_script_snapshot",
            }
        )
    return lessons


@router.get("/classrooms")
def list_classrooms(request: Request):
    with transaction() as db:
        account = user(db, request)
        return [
            {"id": row.id, "title": row.title, "revision": row.revision}
            for row in db.scalars(
                select(ClassroomAssets)
                .where(ClassroomAssets.owner_id == account.id)
                .order_by(ClassroomAssets.created_at.desc())
            )
        ]


@router.post("/classrooms")
def create_classroom(body: CreateClassroom, request: Request):
    with transaction() as db:
        account = user(db, request, True)
        db.scalar(select(Account).where(Account.id == account.id).with_for_update())

        def action():
            cid = str(uuid5(UUID(account.id), "classroom-assets:" + body.action_id))
            classroom = ClassroomAssets(
                id=cid,
                owner_id=account.id,
                title=body.title.strip(),
                assets={"scripts": [], "avatar_pack_id": "stickman"},
            )
            db.add(classroom)
            db.flush()
            return {
                "id": classroom.id,
                "title": classroom.title,
                "revision": classroom.revision,
            }

        return mutate(db, account, "new-classroom", body, action)


@router.get("/classrooms/{cid}")
def classroom(cid: str, request: Request):
    with transaction() as db:
        account = user(db, request)
        classroom = owned(db, cid, account)
        scripts = []
        sessions = []
        for script_id in classroom.assets.get("scripts", []):
            script = db.get(Script, script_id)
            if script and script.owner_id == account.id:
                scripts.append(
                    {
                        "id": script.id,
                        "revision": script.revision,
                        "document": script.document,
                    }
                )
        for link in db.scalars(
            select(SessionLink)
            .where(SessionLink.classroom_id == cid)
            .order_by(SessionLink.created_at.desc())
        ):
            room = db.get(Room, link.room_id)
            if room:
                sessions.append(
                    {
                        "id": room.id,
                        "batch_id": link.batch_id,
                        "kind": link.kind,
                        "phase": room.state["phase"],
                        "title": room.state["title"],
                        "created_at": link.created_at,
                    }
                )
        assets_view = deepcopy(classroom.assets)
        assets_view.get("ai_settings", {}).pop("session_token_hash", None)
        return {
            "id": classroom.id,
            "title": classroom.title,
            "revision": classroom.revision,
            "assets": assets_view,
            "scripts": scripts,
            "sessions": sessions,
            "lessons": _lesson_projection(db, cid),
        }


@router.post("/classrooms/{cid}/scripts")
def attach_script(cid: str, body: AttachScript, request: Request):
    from .contracts import ScriptDocument

    with transaction() as db:
        account = user(db, request, True)
        classroom = owned(db, cid, account, True)

        def action():
            if body.script_id:
                script = db.get(Script, body.script_id)
                if script is None or script.owner_id != account.id:
                    raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
            else:
                document = ScriptDocument.model_validate(
                    ensure_other_options(body.document or {})
                ).model_dump()
                script = Script(
                    id=str(uuid5(UUID(classroom.id), body.action_id)),
                    owner_id=account.id,
                    document=document,
                    revision=1,
                )
                db.add(script)
                db.flush()
            assets = deepcopy(classroom.assets)
            ids = assets.setdefault("scripts", [])
            if script.id not in ids:
                ids.append(script.id)
                classroom.assets = assets
                classroom.revision += 1
            return {
                "id": script.id,
                "revision": script.revision,
                "document": script.document,
                "classroom_id": cid,
            }

        return mutate(db, account, "script:" + cid, body, action)


@router.post("/classrooms/{cid}/batches")
def create_batch(cid: str, body: CreateBatch, request: Request):
    with transaction() as db:
        account = user(db, request, True)
        classroom = owned(db, cid, account, True)
        if body.script_id not in classroom.assets.get("scripts", []):
            raise DomainError("CLASSROOM_SCRIPT_REQUIRED", 422)

        def action():
            response = service.create_room(db, account, body.script_id)
            room = db.get(Room, response["id"])
            state = deepcopy(room.state)
            state["asset_classroom_id"] = cid
            state["asset_classroom_revision"] = classroom.revision
            state["asset_snapshot"] = deepcopy(classroom.assets)
            room.state = state
            db.add(
                SessionLink(
                    room_id=room.id,
                    classroom_id=cid,
                    batch_id=room.id,
                    kind="BATCH",
                )
            )
            return {
                "id": room.id,
                "classroom_id": cid,
                "batch_id": room.id,
                "code": room.code,
            }

        return mutate(db, account, "batch:" + cid, body, action)


def link_group_session(db, parent, group):
    cid = parent.state.get("asset_classroom_id")
    if cid and db.get(SessionLink, group.id) is None:
        db.add(
            SessionLink(
                room_id=group.id,
                classroom_id=cid,
                batch_id=parent.id,
                kind="SESSION",
            )
        )

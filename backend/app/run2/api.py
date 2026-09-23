"""Thin HTTP↔DTO adapters; secrets and room authorities are resolved server-side."""

import asyncio
import os
import time
from copy import deepcopy
from uuid import uuid4
import yaml
from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from . import auth, service
from .contracts import (
    AccountView,
    Command,
    CreateRoom,
    JoinRoom,
    Login,
    MailRequest,
    Reaction,
    Register,
    ResetRequest,
    RoomView,
    ScriptDocument,
    ScriptSave,
    TokenRequest,
)
from .orchestrator import DomainError
from .storage import Event, Membership, Room, Script, transaction
from .realtime import BUS

router = APIRouter(prefix="/api/v2")


def same_origin(request):
    origin = request.headers.get("origin")
    allow = {
        s.rstrip("/")
        for s in os.environ.get(
            "SOCRATES_ALLOWED_ORIGINS",
            os.environ.get("SOCRATES_PUBLIC_ORIGIN", "http://127.0.0.1:8080"),
        ).split(",")
    }
    if origin and origin.rstrip("/") not in allow:
        raise DomainError("ORIGIN_BINDING_REQUIRED", 403)


def account(db, request, mutation=False, verified=True):
    if mutation:
        same_origin(request)
    return auth.identity(
        db,
        request.cookies.get(auth.COOKIE),
        request.headers.get("x-csrf-token"),
        mutation,
        verified,
    )


def auth_limit(request, kind):
    same_origin(request)
    host = request.client.host if request.client else "unknown"
    with transaction() as db:
        service.limit(db, "auth:" + kind + ":" + host, 300, 60)


@router.post("/auth/register")
def register(body: Register, request: Request):
    auth_limit(request, "register")
    return auth.register(body)


@router.post("/auth/login", response_model=AccountView)
def login(body: Login, request: Request, response: Response):
    auth_limit(request, "login")
    token, result = auth.login(body)
    response.set_cookie(
        auth.COOKIE,
        token,
        httponly=True,
        secure=os.environ.get("RUN2_COOKIE_SECURE", "true") == "true",
        samesite="lax",
        max_age=43200,
        path="/",
    )
    return result


@router.get("/auth/me", response_model=AccountView)
def me(request: Request):
    with transaction() as db:
        a, s = account(db, request, verified=False)
        return auth.account_view(db, a, s.csrf_token)


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    with transaction() as db:
        _, s = account(db, request, True, False)
        db.delete(s)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"status": "SIGNED_OUT"}


@router.post("/auth/verify")
def verify(body: TokenRequest, request: Request):
    auth_limit(request, "verify")
    return auth.use_token(body.token, "verify")


@router.post("/auth/verification-email")
def verification_email(body: MailRequest, request: Request):
    auth_limit(request, "mail")
    return auth.request_email(body.email, "verify")


@router.post("/auth/forgot-password")
def forgot(body: MailRequest, request: Request):
    auth_limit(request, "mail")
    return auth.request_email(body.email, "reset")


@router.post("/auth/reset-password")
def reset(body: ResetRequest, request: Request):
    auth_limit(request, "reset")
    return auth.use_token(body.token, "reset", body.password)


@router.get("/scripts")
def scripts(request: Request):
    with transaction() as db:
        a, _ = account(db, request)
        return [
            {"id": s.id, "revision": s.revision, "document": s.document}
            for s in db.scalars(select(Script).where(Script.owner_id == a.id))
        ]


@router.post("/scripts")
def create_script(body: ScriptSave, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        s = Script(owner_id=a.id, document=body.document.model_dump())
        db.add(s)
        db.flush()
        return {"id": s.id, "revision": s.revision, "document": s.document}


@router.put("/scripts/{script_id}")
def update_script(script_id: str, body: ScriptSave, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        s = db.scalar(select(Script).where(Script.id == script_id).with_for_update())
        if s is None or s.owner_id != a.id:
            raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        if body.expected_revision != s.revision:
            raise DomainError("請讀取新版劇本後合併編輯。")
        s.document = body.document.model_dump()
        s.revision += 1
        return {"id": s.id, "revision": s.revision, "document": s.document}


@router.post("/scripts/import")
async def import_script(request: Request):
    raw = await request.body()
    if len(raw) > 1000000:
        raise DomainError("SCRIPT_SIZE", 413)
    doc = ScriptDocument.model_validate(yaml.safe_load(raw))
    return await run_in_threadpool(create_script, ScriptSave(document=doc), request)


@router.get("/scripts/{script_id}/yaml")
def export_yaml(script_id: str, request: Request):
    with transaction() as db:
        a, _ = account(db, request)
        s = db.get(Script, script_id)
        if s is None or s.owner_id != a.id:
            raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        return Response(
            yaml.safe_dump(s.document, allow_unicode=True, sort_keys=False),
            media_type="application/yaml",
        )


@router.post("/scripts/{script_id}/adopt-question/{room_id}/{index}")
def adopt_question(script_id: str, room_id: str, index: int, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        room, _, teacher = service.load(db, room_id, a.id)
        s = db.scalar(select(Script).where(Script.id == script_id).with_for_update())
        if not teacher or s is None or s.owner_id != a.id:
            raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        if index < 0 or index >= len(room.state["questions"]):
            raise DomainError("QUESTION_REQUIRED", 404)
        q = deepcopy(room.state["questions"][index])
        q["id"] = "adopted-" + uuid4().hex[:10]
        doc = deepcopy(s.document)
        doc["questions"].append(q)
        s.document = ScriptDocument.model_validate(doc).model_dump()
        s.revision += 1
        return {"id": s.id, "revision": s.revision}


@router.post("/classrooms", response_model=RoomView)
def create_room(body: CreateRoom, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return service.create_room(db, a, body.script_id)


@router.post("/classrooms/join", response_model=RoomView)
def join(body: JoinRoom, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return service.join(db, a, body)


@router.get("/classrooms")
def rooms(request: Request):
    with transaction() as db:
        a, _ = account(db, request)
        ids = list(db.scalars(select(Membership.room_id).where(Membership.account_id == a.id)))
        rows = db.scalars(select(Room).where((Room.creator_id == a.id) | (Room.id.in_(ids)))).all()
        return [
            {
                "id": r.id,
                "title": r.state["title"],
                "phase": r.state["phase"],
                "teacher": r.creator_id == a.id,
            }
            for r in rows
        ]


@router.get("/classrooms/{room_id}", response_model=RoomView)
def room_view(room_id: str, request: Request, mode: str = "student"):
    with transaction() as db:
        a, _ = account(db, request)
        r, _, _ = service.load(db, room_id, a.id)
        return service.view(db, r, a.id, mode)


@router.post("/classrooms/{room_id}/commands")
def command(room_id: str, body: Command, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return service.execute(db, a, room_id, body)


@router.post("/classrooms/{room_id}/reactions")
def reaction(room_id: str, body: Reaction, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return service.react(db, a, room_id, body)


@router.get("/classrooms/{room_id}/events")
def events(room_id: str, request: Request, after: int = 0):
    with transaction() as db:
        a, _ = account(db, request)
        r, _, _ = service.load(db, room_id, a.id)
        rows = db.scalars(
            select(Event)
            .where(Event.room_id == room_id, Event.seq > after)
            .order_by(Event.seq)
            .limit(500)
        ).all()
        return {
            "events": [{"seq": e.seq, "type": e.type, "payload": e.payload} for e in rows],
            "latest_seq": r.seq,
            "more": bool(rows and rows[-1].seq < r.seq),
        }


@router.post("/classrooms/{room_id}/budget")
def adjust_budget(room_id: str, request: Request, live_llm_call_budget: int):
    if live_llm_call_budget < 0 or live_llm_call_budget > 100000:
        raise DomainError("BUDGET_RANGE", 422)
    with transaction() as db:
        a, _ = account(db, request, True)
        room, _, teacher = service.load(db, room_id, a.id, True)
        if not teacher:
            raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
        state = deepcopy(room.state)
        if "script" not in state:
            raise DomainError("STARTED_CLASSROOM_REQUIRED")
        state["script"]["live_llm_call_budget"] = live_llm_call_budget
        room.state = state
        from .storage import Job, append_event

        for j in db.scalars(select(Job).where(Job.room_id == room.id, Job.state == "PENDING")):
            j.next_at = time.time()
        append_event(
            db,
            room,
            {"type": "budget.updated", "payload": {"live_llm_call_budget": live_llm_call_budget}},
        )
        return {"live_llm_call_budget": live_llm_call_budget, "used": room.llm_used}


@router.websocket("/classrooms/{room_id}/ws")
async def websocket(ws: WebSocket, room_id: str):
    try:
        same_origin(ws)

        def identify():
            with transaction() as db:
                a, s = auth.identity(db, ws.cookies.get(auth.COOKIE))
                r, m, _ = service.load(db, room_id, a.id)
                return (
                    a.id,
                    s.expires_at,
                    m.id if m else None,
                    service.view(db, r, a.id, ws.query_params.get("mode", "student")),
                )

        aid, expiry, mid, snapshot = await asyncio.to_thread(identify)
    except DomainError:
        await ws.close(code=4403)
        return
    await ws.accept()
    try:
        after = max(0, int(ws.query_params.get("last_seq", "0")))
    except ValueError:
        after = 0

    def replay():
        with transaction() as db:
            rows = db.scalars(
                select(Event)
                .where(Event.room_id == room_id, Event.seq > after, Event.seq <= snapshot["seq"])
                .order_by(Event.seq)
                .limit(500)
            ).all()
            return [
                {"type": e.type, "payload": e.payload, "seq": e.seq, "durable": True} for e in rows
            ]

    # The snapshot is authoritative; the replay packet preserves event custody.
    await ws.send_json(
        {
            "type": "replay",
            "events": await asyncio.to_thread(replay),
            "through_seq": snapshot["seq"],
        }
    )
    BUS.clients[room_id].add(ws)
    BUS.last.setdefault(room_id, snapshot["seq"])
    await ws.send_json({"type": "snapshot", "seq": snapshot["seq"], "room": snapshot})
    for (r, g), buf in list(BUS.buffers.items()):
        if r == room_id:
            await ws.send_json({"type": "tutor.buffer", "generation_id": g, "text": buf})
    await BUS.sync_buffer(room_id)
    try:
        while True:
            data = await asyncio.wait_for(ws.receive_json(), 30)
            if time.time() > expiry:
                await ws.close(code=4401)
                return
            if data.get("type") == "ping":

                def heartbeat():
                    with transaction() as db:
                        # Reset/logout revocation is observed on every heartbeat.
                        auth.identity(db, ws.cookies.get(auth.COOKIE))
                        if mid:
                            m = db.get(Membership, mid)
                            m.last_seen = time.time()

                await asyncio.to_thread(heartbeat)
                await ws.send_json(
                    {"type": "pong", "server_now": time.time(), "echo": data.get("sent_at")}
                )
            elif data.get("type") == "buffer_sync":
                await BUS.sync_buffer(room_id)
    except (WebSocketDisconnect, asyncio.TimeoutError, DomainError):
        pass
    finally:
        BUS.clients[room_id].discard(ws)
        BUS.send_locks.pop(ws, None)

"""Thin HTTP↔DTO adapters; secrets and room authorities are resolved server-side."""

import asyncio
import time
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.modules.identity_access import service as auth
from app.modules.identity_access.service import account, same_origin
from app.modules.classroom_core import runtime as service
from app.modules.classroom_core.contracts import (
    Command,
    CreateRoom,
    JoinRoom,
    Reaction,
    RoomSummary,
    RoomView,
    ScriptRevisionView,
    ClassroomActionReceipt,
    ClassroomEventPage,
    RoomBudgetView,
)
from app.modules.platform.errors import DomainError
from app.modules.classroom_core.repositories import Event, Membership, Room
from app.modules.platform.storage import transaction
from app.modules.classroom_core.realtime import BUS
from app.modules.classroom_core.service import adopt_room_question, adjust_room_budget

router = APIRouter(prefix="/api/v2")


@router.post(
    "/scripts/{script_id}/adopt-question/{room_id}/{index}", response_model=ScriptRevisionView
)
def adopt_question(script_id: str, room_id: str, index: int, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return adopt_room_question(db, a, _, script_id, room_id, index)


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


@router.get("/classrooms", response_model=list[RoomSummary])
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


@router.post("/classrooms/{room_id}/commands", response_model=ClassroomActionReceipt)
def command(room_id: str, body: Command, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return service.execute(db, a, room_id, body)


@router.post("/classrooms/{room_id}/reactions", response_model=ClassroomActionReceipt)
def reaction(room_id: str, body: Reaction, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        return service.react(db, a, room_id, body)


@router.get("/classrooms/{room_id}/events", response_model=ClassroomEventPage)
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


@router.post("/classrooms/{room_id}/budget", response_model=RoomBudgetView)
def adjust_budget(room_id: str, request: Request, live_llm_call_budget: int):
    if live_llm_call_budget < 0 or live_llm_call_budget > 100000:
        raise DomainError("BUDGET_RANGE", 422)
    with transaction() as db:
        a, _ = account(db, request, True)
        return adjust_room_budget(db, a, _, room_id, live_llm_call_budget)


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

"""Postgres notification wakeups + durable replay; ephemeral tutor buffers are mirrored.

Every websocket is authenticated and scoped to a classroom membership. LISTEN is
committed before initial snapshots. Polling durable events is a catch-up path.
"""

from typing import Any
import asyncio
import json
import os
from collections import defaultdict
from sqlalchemy import select
from .storage import Event, notify, transaction


class RealtimeBus:
    def __init__(self):
        self.clients: dict[str, set[Any]] = defaultdict(set)
        self.buffers: dict[tuple[str, str], str] = {}
        self.owned_buffers: dict[tuple[str, str], str] = {}
        self.last: dict[str, int] = {}
        self.listener_ready = False
        self.closed_generations: set[tuple[str, str]] = set()
        self.send_locks: dict[Any, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def send_room(self, room, payload):
        for ws in list(self.clients[room]):
            try:
                async with self.send_locks[ws]:
                    await asyncio.wait_for(ws.send_json(payload), 2)
            except Exception:
                self.clients[room].discard(ws)

    def _notify(self, payload):
        with transaction() as db:
            notify(db, payload)

    async def emit_ephemeral(self, room, generation, text, offset):
        p = {
            "room": room,
            "ephemeral": True,
            "type": "tutor.delta",
            "generation_id": generation,
            "offset": offset,
            "text": text,
        }
        self.owned_buffers[(room, generation)] = (
            self.owned_buffers.get((room, generation), "") + text
        )
        await self.receive(p)
        await asyncio.to_thread(self._notify, p)

    async def receive(self, p):
        room = p.get("room")
        if p.get("type") == "stream.snapshot.request":
            for (r, g), buf in list(self.owned_buffers.items()):
                if r == room:
                    for offset in range(0, len(buf), 1000):
                        await asyncio.to_thread(
                            self._notify,
                            {
                                "room": r,
                                "ephemeral": True,
                                "type": "tutor.delta",
                                "generation_id": g,
                                "offset": offset,
                                "text": buf[offset : offset + 1000],
                            },
                        )
            return
        if p.get("ephemeral"):
            key = (room, p["generation_id"])
            if key in self.closed_generations:
                return
            buf = self.buffers.get(key, "")
            offset = p["offset"]
            if offset <= len(buf):
                merged = buf[:offset] + p["text"]
                if len(merged) > len(buf):
                    self.buffers[key] = merged
                    await self.send_room(room, {**p, "durable": False})
            return
        if room in self.clients:
            await self.catch_up(room)

    async def catch_up(self, room):
        def fetch():
            with transaction() as db:
                rows = db.scalars(
                    select(Event)
                    .where(Event.room_id == room, Event.seq > self.last.get(room, 0))
                    .order_by(Event.seq)
                    .limit(2000)
                ).all()
                return [
                    {"type": r.type, "payload": r.payload, "seq": r.seq, "durable": True}
                    for r in rows
                ]

        rows = await asyncio.to_thread(fetch)
        for event in rows:
            if event["seq"] <= self.last.get(room, 0):
                continue
            self.last[room] = event["seq"]
            if event["type"] == "tutor.final":
                self.close_generation(room, event["payload"].get("generation_id"))
            await self.send_room(room, event)

    async def listen(self):
        url = os.environ.get("RUN2_DATABASE_URL", os.environ.get("DATABASE_URL", "")).replace(
            "postgresql+psycopg://", "postgresql://", 1
        )
        if url.startswith("sqlite"):
            return
        import psycopg

        while True:
            try:
                async with await psycopg.AsyncConnection.connect(url, autocommit=True) as c:
                    await c.execute("LISTEN socrates_run2")
                    self.listener_ready = True
                    for room in list(self.clients):
                        await self.catch_up(room)
                    async for n in c.notifies():
                        try:
                            await self.receive(json.loads(n.payload))
                        except (ValueError, KeyError):
                            continue
            except asyncio.CancelledError:
                raise
            except Exception:
                self.listener_ready = False
                await asyncio.sleep(2)

    async def sweep(self):
        while True:
            for room in list(self.clients):
                if self.clients[room]:
                    await self.catch_up(room)
            await asyncio.sleep(1)

    async def sync_buffer(self, room):
        await asyncio.to_thread(self._notify, {"room": room, "type": "stream.snapshot.request"})

    def close_generation(self, room, key):
        self.owned_buffers.pop((room, key), None)
        self.buffers.pop((room, key), None)
        self.closed_generations.add((room, key))
        if len(self.closed_generations) > 10000:
            self.closed_generations.pop()


BUS = RealtimeBus()

"""Restartable deadline and LLM workers. Durable leases release only current job identities."""

import asyncio
import datetime as dt
import os
import smtplib
import time
from email.message import EmailMessage
from uuid import uuid4
from sqlalchemy import or_, select
from .orchestrator import GameOrchestrator
from .prompts import compile_program
from .provider import OpenRouterProvider, ProviderWait, fallback
from .realtime import BUS
from .service import hydrate, tick_due
from .storage import Budget, CallAudit, Job, Mail, Room, persist_machine, transaction


def claim_job():
    now = time.time()
    with transaction() as db:
        job = db.scalar(
            select(Job)
            .where(
                or_(
                    (Job.state == "PENDING") & (Job.next_at <= now),
                    (Job.state == "RUNNING") & (Job.lease_until < now),
                )
            )
            .order_by(Job.priority, Job.next_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            return None
        job.state = "RUNNING"
        job.lease = str(uuid4())
        job.lease_until = now + 150
        job.attempts += 1
        messages, schema, metadata = compile_program(db, job.kind, job.context)
        return {
            "id": job.id,
            "room": job.room_id,
            "key": job.logical_key,
            "kind": job.kind,
            "context": job.context,
            "lease": job.lease,
            "messages": messages,
            "schema": schema,
            "metadata": metadata,
        }


def reserve_call(item):
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise ProviderWait("OPENROUTER_KEY_BINDING", 60)
    now = dt.datetime.now(dt.timezone.utc)
    day = now.date().isoformat()
    seconds = (
        dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(), dt.timezone.utc) - now
    ).total_seconds()
    with transaction() as db:
        # Job -> room -> budget follows finish_job's lock order.
        j = db.scalar(select(Job).where(Job.id == item["id"]).with_for_update())
        if j.lease != item["lease"]:
            raise ProviderWait("JOB_LEASE_RECONCILIATION", 30)
        room = db.scalar(select(Room).where(Room.id == item["room"]).with_for_update())
        limit = room.state["script"]["live_llm_call_budget"]
        if room.llm_used >= limit:
            raise ProviderWait("CLASSROOM_BUDGET_AVAILABILITY", max(60, seconds))
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from sqlalchemy.dialects.sqlite import insert as sq_insert

        ins = pg_insert if db.bind.dialect.name == "postgresql" else sq_insert
        db.execute(
            ins(Budget).values(id=day, calls=0).on_conflict_do_nothing(index_elements=[Budget.id])
        )
        budget = db.scalar(select(Budget).where(Budget.id == day).with_for_update())
        if budget.calls >= int(os.environ.get("RUN2_LLM_DAILY_BUDGET", "50")):
            raise ProviderWait("GLOBAL_BUDGET_AVAILABILITY", max(60, seconds))
        j.lease_until = time.time() + 150
        budget.calls += 1
        room.llm_used += 1


def wait_job(item, reason, seconds):
    with transaction() as db:
        j = db.scalar(select(Job).where(Job.id == item["id"]).with_for_update())
        if j.lease != item["lease"]:
            return
        j.state = "PENDING"
        j.next_at = time.time() + seconds
        j.lease = None
        j.audit = {**item["metadata"], "state": "PENDING", "reason": reason, "retry_at": j.next_at}
        db.add(CallAudit(job_id=j.id, metadata_json=j.audit))


def audit_attempt(item, audit):
    with transaction() as db:
        db.add(CallAudit(job_id=item["id"], metadata_json={**item["metadata"], **audit}))


def finish_job(item, result, audit):
    with transaction() as db:
        j = db.scalar(select(Job).where(Job.id == item["id"]).with_for_update())
        if j.state != "RUNNING" or j.lease != item["lease"]:
            return
        room = db.scalar(select(Room).where(Room.id == item["room"]).with_for_update())
        machine = GameOrchestrator(hydrate(db, room), time.time())
        machine.complete_job(j.kind, j.logical_key, result, audit)
        persist_machine(db, room, machine)
        j.state = "READY"
        j.result = result
        j.audit = {**item["metadata"], **audit}
        j.lease = None
        db.add(CallAudit(job_id=j.id, metadata_json=j.audit))


async def process_job(item):
    offset = 0
    pending = ""
    last_flush = time.monotonic()

    async def on_delta(delta):
        nonlocal offset, pending, last_flush
        pending += delta
        if time.monotonic() - last_flush < 0.12 and len(pending) < 500:
            return
        while pending:
            part = pending[:1000]
            pending = pending[1000:]
            await BUS.emit_ephemeral(item["room"], item["key"], part, offset)
            offset += len(part)
        last_flush = time.monotonic()

    provider = OpenRouterProvider()
    error: ProviderWait | None = None
    for attempt in range(2):
        try:
            await asyncio.to_thread(reserve_call, item)
            result, audit = await asyncio.wait_for(
                provider.generate(item["messages"], item["schema"], on_delta), 120
            )
            if pending:
                await BUS.emit_ephemeral(item["room"], item["key"], pending, offset)
            await asyncio.to_thread(finish_job, item, result, {**audit, "attempt": attempt + 1})
            BUS.close_generation(item["room"], item["key"])
            return
        except asyncio.CancelledError:
            raise
        except ProviderWait as exc:
            error = exc
            break
        except Exception as exc:
            # Retrying provider traffic retains a distinct attempt; domain result commits once.
            error = ProviderWait(type(exc).__name__, 60)
            await asyncio.to_thread(
                audit_attempt,
                item,
                {
                    "provider": "openrouter",
                    "attempt": attempt + 1,
                    "state": "ATTEMPT_RECORDED",
                    "error_type": type(exc).__name__,
                    "partial_characters": offset,
                },
            )
            if offset:
                break
            await asyncio.sleep(1)
    if error is None:
        # 迴圈的成功路徑會 return，所以到得了這裡就代表某次嘗試留下了 ProviderWait。
        raise RuntimeError("provider loop exited without a result or a wait")
    if item["kind"] == "focused_tutor":
        result = fallback(item["context"])
        await asyncio.to_thread(
            finish_job,
            item,
            result,
            {
                "provider": "scripted-probe-hints",
                "actual_model": None,
                "request_id": None,
                "latency_ms": 0,
                "token_usage": {},
                "fallback_used": True,
                "reason": error.reason,
            },
        )
    else:
        await asyncio.to_thread(wait_job, item, error.reason, error.seconds)
    BUS.close_generation(item["room"], item["key"])


async def llm_loop():
    while True:
        try:
            item = await asyncio.to_thread(claim_job)
            if item:
                await process_job(item)
            else:
                await asyncio.sleep(0.25)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print("RUN2_JOB_RECONCILE " + type(exc).__name__, flush=True)
            await asyncio.sleep(2)


async def clock_loop():
    while True:
        try:
            await asyncio.to_thread(tick_due)
        except Exception as exc:
            print("RUN2_CLOCK_RECONCILE " + type(exc).__name__, flush=True)
        await asyncio.sleep(0.05)


def send_mail_once():
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        return
    with transaction() as db:
        row = db.scalar(
            select(Mail)
            .where(Mail.state == "PENDING", Mail.next_at <= time.time())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if row is None:
            return
        msg = EmailMessage()
        msg["From"] = os.environ.get("SMTP_FROM", "socrates@localhost")
        msg["To"] = row.recipient
        msg["Subject"] = row.subject
        msg.set_content(row.body)
        try:
            port = int(os.environ.get("SMTP_PORT", "587"))
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                if os.environ.get("SMTP_STARTTLS", "true") == "true":
                    smtp.starttls()
                if os.environ.get("SMTP_USER"):
                    smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                smtp.send_message(msg)
            row.state = "SENT"
            row.body = "DELIVERED"
        except Exception:
            row.attempts += 1
            row.next_at = time.time() + min(3600, 30 * 2 ** min(row.attempts, 6))


async def mail_loop():
    while True:
        try:
            await asyncio.to_thread(send_mail_once)
        except Exception as exc:
            print("RUN2_MAIL_RECONCILE " + type(exc).__name__, flush=True)
        await asyncio.sleep(2)

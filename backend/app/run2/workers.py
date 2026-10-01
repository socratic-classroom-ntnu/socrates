"""Restartable workers with Classroom-owner provider routing and durable audits."""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import smtplib
import time
from email.message import EmailMessage
from uuid import uuid4

from sqlalchemy import or_, select

from .contracts import DynamicResult, SummaryResult
from .orchestrator import GameOrchestrator
from .portal_ai_students import fallback_turn
from .prompts import compile_program
from .provider import ProviderWait, fallback
from .provider_gateway import generate
from .provider_profiles import (
    public_binding,
    resolve_provider_chain,
)
from .realtime import BUS
from .service import hydrate, tick_due
from .storage import (
    Budget,
    CallAudit,
    Job,
    Mail,
    Room,
    persist_machine,
    transaction,
)


def claim_job():
    current = time.time()
    with transaction() as db:
        job = db.scalar(
            select(Job)
            .where(
                or_(
                    (Job.state == "PENDING") & (Job.next_at <= current),
                    (Job.state == "RUNNING") & (Job.lease_until < current),
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
        job.lease_until = current + 150
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


def _used_cost(db, room_id: str) -> tuple[int, float]:
    rows = db.scalars(
        select(CallAudit).join(Job, Job.id == CallAudit.job_id).where(Job.room_id == room_id)
    ).all()
    tokens = 0
    cost = 0.0
    for row in rows:
        metadata = row.metadata_json or {}
        usage = metadata.get("token_usage") or {}
        tokens += int(
            usage.get("total_tokens")
            or ((usage.get("prompt_tokens") or 0) + (usage.get("completion_tokens") or 0))
            or ((usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0))
            or 0
        )
        estimated = metadata.get("estimated_cost")
        if estimated is not None:
            cost += float(estimated)
    return tokens, cost


def reserve_call(item):
    current = dt.datetime.now(dt.timezone.utc)
    day = current.date().isoformat()
    seconds = (
        dt.datetime.combine(
            current.date() + dt.timedelta(days=1),
            dt.time(),
            dt.timezone.utc,
        )
        - current
    ).total_seconds()
    with transaction() as db:
        job = db.scalar(select(Job).where(Job.id == item["id"]).with_for_update())
        if job.lease != item["lease"]:
            raise ProviderWait("JOB_LEASE_RECONCILIATION", 30)
        room = db.scalar(select(Room).where(Room.id == item["room"]).with_for_update())
        bindings, routing = resolve_provider_chain(db, room, item["kind"], item["context"])
        budgets = routing["budgets"]
        logical_limit = int(
            budgets.get("max_calls") or room.state["script"]["live_llm_call_budget"]
        )
        if item["kind"] == "llm_student_turn":
            logical_limit = max(
                logical_limit,
                int(os.environ.get("PORTAL_AI_CALL_BUDGET", "240")),
            )
        if room.llm_used >= logical_limit:
            raise ProviderWait(
                "CLASSROOM_BUDGET_AVAILABILITY",
                max(60, seconds),
            )

        used_tokens, used_cost = _used_cost(db, room.id)
        if used_tokens >= int(budgets.get("max_tokens", 0)):
            raise ProviderWait(
                "CLASSROOM_TOKEN_BUDGET_AVAILABILITY",
                max(60, seconds),
            )
        ceiling = budgets.get("estimated_cost_ceiling")
        if ceiling is not None and used_cost >= float(ceiling):
            raise ProviderWait(
                "CLASSROOM_COST_BUDGET_AVAILABILITY",
                max(60, seconds),
            )

        from sqlalchemy.dialects.postgresql import (
            insert as pg_insert,
        )
        from sqlalchemy.dialects.sqlite import (
            insert as sq_insert,
        )

        insert = pg_insert if db.bind.dialect.name == "postgresql" else sq_insert
        db.execute(
            insert(Budget)
            .values(id=day, calls=0)
            .on_conflict_do_nothing(index_elements=[Budget.id])
        )
        budget = db.scalar(select(Budget).where(Budget.id == day).with_for_update())
        global_limit = int(os.environ.get("RUN2_LLM_DAILY_BUDGET", "1000000"))
        if budget.calls >= global_limit:
            raise ProviderWait(
                "GLOBAL_BUDGET_AVAILABILITY",
                max(60, seconds),
            )
        job.lease_until = time.time() + 150
        budget.calls += 1
        room.llm_used += 1
        return bindings, routing


def wait_job(item, reason, seconds):
    with transaction() as db:
        job = db.scalar(select(Job).where(Job.id == item["id"]).with_for_update())
        if job.lease != item["lease"]:
            return
        job.state = "PENDING"
        job.next_at = time.time() + seconds
        job.lease = None
        job.audit = {
            **item["metadata"],
            "state": "PENDING",
            "reason": reason,
            "retry_at": job.next_at,
        }
        db.add(
            CallAudit(
                job_id=job.id,
                metadata_json=job.audit,
            )
        )


def audit_attempt(item, audit):
    with transaction() as db:
        db.add(
            CallAudit(
                job_id=item["id"],
                metadata_json={
                    **item["metadata"],
                    **audit,
                },
            )
        )


def finish_job(item, result, audit):
    with transaction() as db:
        job = db.scalar(select(Job).where(Job.id == item["id"]).with_for_update())
        if job.state != "RUNNING" or job.lease != item["lease"]:
            return
        room = db.scalar(select(Room).where(Room.id == item["room"]).with_for_update())
        machine = GameOrchestrator(hydrate(db, room), time.time())
        machine.complete_job(
            job.kind,
            job.logical_key,
            result,
            audit,
        )
        persist_machine(db, room, machine)
        job.state = "READY"
        job.result = result
        job.audit = {
            **item["metadata"],
            **audit,
        }
        job.lease = None
        db.add(
            CallAudit(
                job_id=job.id,
                metadata_json=job.audit,
            )
        )


def deterministic_result(item, reason):
    context = item["context"]
    kind = item["kind"]
    if kind == "focused_tutor":
        result = fallback(context)
        provider = "scripted-probe-hints"
    elif kind == "llm_student_turn":
        result = fallback_turn(context)
        provider = "deterministic-ai-student"
    elif kind in {
        "question_summary",
        "class_summary",
        "personal_summary",
    }:
        if kind == "question_summary":
            count = len(context.get("answers", []))
            text = f"本題已保存 {count} 份作答與代表討論。"
        elif kind == "class_summary":
            text = "本次課堂的逐題摘要與觀點變化已保存。"
        else:
            text = "你的作答、理由與討論紀錄已保存，後續可沿原話繼續整理。"
        result = SummaryResult(
            text=text,
            key_points=[
                "保留原始作答與討論",
                "Provider 恢復後可產生進一步整理",
            ],
        ).model_dump()
        provider = "deterministic-summary"
    elif kind == "dynamic_question":
        question = context.get("question") or {
            "id": "deterministic-next",
            "title": "換一個條件，你的選擇會改變嗎？",
            "scenario": ("請比較原本理由與新增條件，並說明目前最重視的原則。"),
            "options": [
                {"id": "stay", "text": "維持原選擇"},
                {"id": "change", "text": "改變選擇"},
                {"id": "__other__", "text": "其他"},
            ],
            "duration_seconds": 90,
            "argument_required": True,
            "tutor_goal": "辨認立場改變的條件。",
            "probe_hints": ["哪一個條件最直接改變你的判斷？"],
            "max_focus_turns": 3,
            "focus_response_seconds": 90,
            "sender_point_cap": 5,
            "receiver_point_cap": 25,
        }
        result = DynamicResult.model_validate({"question": question}).model_dump()
        provider = "deterministic-question"
    else:
        return None, None
    audit = {
        "provider": provider,
        "provider_profile_id": None,
        "classroom_owner_id": None,
        "requested_model": None,
        "actual_model": None,
        "use_case": kind,
        "latency_ms": 0,
        "token_usage": {},
        "estimated_cost": 0.0,
        "fallback_used": True,
        "reason": reason,
    }
    return result, audit


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
            await BUS.emit_ephemeral(
                item["room"],
                item["key"],
                part,
                offset,
            )
            offset += len(part)
        last_flush = time.monotonic()

    error = ProviderWait("OWNER_PROVIDER_PROFILE_REQUIRED", 60)
    try:
        bindings, routing = await asyncio.to_thread(reserve_call, item)
    except ProviderWait as exc:
        bindings, routing = (
            [],
            {
                "owner_id": None,
                "role": item["kind"],
                "selected_profile_id": None,
                "fallback_profile_id": None,
                "requested_model": None,
            },
        )
        error = exc

    for attempt, binding in enumerate(bindings, start=1):
        try:
            result, audit = await asyncio.wait_for(
                generate(
                    binding,
                    item["messages"],
                    item["schema"],
                    on_delta,
                ),
                130,
            )
            if pending:
                await BUS.emit_ephemeral(
                    item["room"],
                    item["key"],
                    pending,
                    offset,
                )
                pending = ""
            await asyncio.to_thread(
                finish_job,
                item,
                result,
                {
                    **audit,
                    "attempt": attempt,
                    "routing": routing,
                },
            )
            BUS.close_generation(item["room"], item["key"])
            return
        except asyncio.CancelledError:
            raise
        except ProviderWait as exc:
            error = exc
            await asyncio.to_thread(
                audit_attempt,
                item,
                {
                    **public_binding(binding),
                    "attempt": attempt,
                    "state": "PROFILE_ATTEMPT_RECORDED",
                    "reason": exc.reason,
                    "partial_characters": offset,
                    "routing": routing,
                },
            )
        except Exception as exc:
            error = ProviderWait(type(exc).__name__, 60)
            await asyncio.to_thread(
                audit_attempt,
                item,
                {
                    **public_binding(binding),
                    "attempt": attempt,
                    "state": "PROFILE_ATTEMPT_RECORDED",
                    "error_type": type(exc).__name__,
                    "partial_characters": offset,
                    "routing": routing,
                },
            )
        if offset:
            break

    result, audit = deterministic_result(item, error.reason)
    if result is not None:
        await asyncio.to_thread(
            finish_job,
            item,
            result,
            {
                **audit,
                "routing": routing,
            },
        )
    else:
        await asyncio.to_thread(
            wait_job,
            item,
            error.reason,
            error.seconds,
        )
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
            print(
                "RUN2_JOB_RECONCILE " + type(exc).__name__,
                flush=True,
            )
            await asyncio.sleep(2)


async def clock_loop():
    while True:
        try:
            await asyncio.to_thread(tick_due)
        except Exception as exc:
            print(
                "RUN2_CLOCK_RECONCILE " + type(exc).__name__,
                flush=True,
            )
        await asyncio.sleep(0.05)


def send_mail_once():
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        return
    with transaction() as db:
        row = db.scalar(
            select(Mail)
            .where(
                Mail.state == "PENDING",
                Mail.next_at <= time.time(),
            )
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if row is None:
            return
        message = EmailMessage()
        message["From"] = os.environ.get("SMTP_FROM", "socrates@localhost")
        message["To"] = row.recipient
        message["Subject"] = row.subject
        message.set_content(row.body)
        try:
            port = int(os.environ.get("SMTP_PORT", "587"))
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                if os.environ.get("SMTP_STARTTLS", "true") == "true":
                    smtp.starttls()
                if os.environ.get("SMTP_USER"):
                    smtp.login(
                        os.environ["SMTP_USER"],
                        os.environ.get("SMTP_PASSWORD", ""),
                    )
                smtp.send_message(message)
            row.state = "SENT"
            row.body = "DELIVERED"
        except Exception:
            row.attempts += 1
            row.next_at = time.time() + min(
                3600,
                30 * 2 ** min(row.attempts, 6),
            )


async def mail_loop():
    while True:
        try:
            await asyncio.to_thread(send_mail_once)
        except Exception as exc:
            print(
                "RUN2_MAIL_RECONCILE " + type(exc).__name__,
                flush=True,
            )
        await asyncio.sleep(2)

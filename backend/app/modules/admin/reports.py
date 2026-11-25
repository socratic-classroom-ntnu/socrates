"""後台「報表」：評測與語音用量，都從已經留下的紀錄算，不另外呼叫模型。

評測（llm_runtime 的題單）：QA 以學生身分在一個情境＝題單情境的活動裡，依序送出某一題的每一則
訊息，那一題就算作答過一次。分數只看導師對最後一則的回覆：回覆文字、它的 move，以及那則學生
訊息上的 flags，交給 llm_runtime 的同一套評分。一位學生在一個活動只有一次作答，所以每一題用一個
新的學生（或訪客）作答，題與題之間才不會互相影響。

語音用量：每一場語音對話留一列 llm_call_audit（endpoint solo.voice），語音模式的確認判斷另一列
（solo.voice_confirmation）。費用＝ token 數 × 部署設定的每百萬 token 單價；確認判斷用它自己記下的
估計費用。
"""

from __future__ import annotations

import time
import unicodedata
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.admin.contracts import (
    EvalCaseView,
    EvalMeasureView,
    EvalReportView,
    VoiceReportView,
    VoiceSessionView,
    VoiceTotalsView,
)
from app.modules.ai_providers.repositories import CallAudit
from app.modules.identity_access.repositories import Account
from app.modules.llm_runtime.service import (
    EVAL_DEFAULT_LOCALE,
    EVAL_MEASURES,
    eval_rate,
    eval_student_texts,
    load_eval_cases,
    score_eval_case,
)
from app.modules.platform.env import env_str
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage

DAY = 86400
VOICE_ENDPOINTS = ("solo.voice", "solo.voice_confirmation")
INPUT_RATE_ENV = "VOICE_INPUT_COST_PER_MILLION"
OUTPUT_RATE_ENV = "VOICE_OUTPUT_COST_PER_MILLION"


def _same(text: str) -> str:
    """Typed text compared loosely: width forms folded and whitespace ignored."""
    return "".join(unicodedata.normalize("NFKC", text).split())


# ---- 評測 ----------------------------------------------------------------------------------


def _dialogues(db: Session, scenario: str, since: float) -> list[list[SoloMessage]]:
    """Each attempt's messages on the eval scenario since ``since``, one list per scenario run."""
    target = _same(scenario)
    found: list[list[SoloMessage]] = []
    attempts = db.scalars(
        select(SoloAttempt).where(SoloAttempt.created_at >= since).order_by(SoloAttempt.created_at)
    )
    for attempt in attempts:
        indexes = {
            i
            for i, entry in enumerate(attempt.progress or [])
            if _same(str((entry or {}).get("text", ""))) == target
        }
        if not indexes:
            continue
        messages = db.scalars(
            select(SoloMessage)
            .where(SoloMessage.attempt_id == attempt.id)
            .where(SoloMessage.scenario_index.in_(indexes))
            .order_by(SoloMessage.seq)
        ).all()
        for index in sorted(indexes):
            found.append([m for m in messages if m.scenario_index == index])
    return found


def _run(case: dict[str, Any], dialogue: list[SoloMessage]) -> dict[str, Any] | None:
    """The case's scored run in this dialogue, or None when the dialogue is not this case yet."""
    typed = eval_student_texts(case)
    students = [m for m in dialogue if m.role == "student"]
    if len(students) < len(typed):
        return None
    if [_same(m.text) for m in students[: len(typed)]] != [_same(t) for t in typed]:
        return None
    last = students[len(typed) - 1]
    tutor = next((m for m in dialogue if m.role == "tutor" and m.seq > last.seq), None)
    if tutor is None:
        return None
    expected = case.get("locale", EVAL_DEFAULT_LOCALE)
    result = {
        "reply_text": tutor.text,
        "move": (tutor.meta or {}).get("move"),
        "flags": last.flags,
    }
    context = {
        "output_locale": expected,
        "student_messages": [
            {"ref": f"m{i + 1}", "text": m.text} for i, m in enumerate(students[: len(typed)])
        ],
    }
    # A stored reply already passed the program's schema; a failed call stores no reply.
    row = score_eval_case(case, result, True, context)
    chosen = last.locale or EVAL_DEFAULT_LOCALE
    row["note"] = None if chosen == expected else f"語言設定是 {chosen}，這題要先切到 {expected}"
    return row


def eval_report(db: Session, days: int, now: float | None = None) -> EvalReportView:
    spec = load_eval_cases()
    since = (now or time.time()) - days * DAY
    dialogues = _dialogues(db, spec["scenario"], since)
    every: list[dict[str, Any]] = []
    cases: list[EvalCaseView] = []
    for case in spec["cases"]:
        runs = [r for r in (_run(case, d) for d in dialogues) if r is not None]
        every += runs
        cases.append(
            EvalCaseView(
                id=case["id"],
                category=case["category"],
                messages=eval_student_texts(case),
                locale=case.get("locale", EVAL_DEFAULT_LOCALE),
                runs=len(runs),
                schema=eval_rate(runs, "schema")[0],
                move=eval_rate(runs, "move")[0],
                flags=eval_rate(runs, "flags")[0],
                check=eval_rate(runs, "check")[0],
                language=eval_rate(runs, "language")[0],
                leaked=sum(bool(r["leaked"]) for r in runs),
                notes=sorted({r["note"] for r in runs if r["note"]}),
            )
        )
    totals = []
    for key in EVAL_MEASURES:
        value, count = eval_rate(every, key)
        totals.append(EvalMeasureView(key=key, rate=value, count=count))
    return EvalReportView(
        scenario=spec["scenario"],
        tutor_goal=spec["tutor_goal"],
        days=days,
        runs=len(every),
        leaked=sum(bool(r["leaked"]) for r in every),
        totals=totals,
        cases=cases,
    )


# ---- 語音用量 ------------------------------------------------------------------------------


def _first(usage: dict[str, Any], *keys: str) -> int:
    for key in keys:
        value = usage.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return int(value)
    return 0


def _audio(details: Any) -> int:
    if not isinstance(details, list):
        return 0
    return sum(
        int(d.get("tokenCount") or 0)
        for d in details
        if isinstance(d, dict) and str(d.get("modality", "")).upper() == "AUDIO"
    )


def _rates() -> tuple[float, float] | None:
    raw = (env_str(INPUT_RATE_ENV).strip(), env_str(OUTPUT_RATE_ENV).strip())
    if not all(raw):
        return None
    try:
        return float(raw[0]), float(raw[1])
    except ValueError:
        return None


def voice_report(db: Session, days: int, now: float | None = None) -> VoiceReportView:
    since = (now or time.time()) - days * DAY
    rates = _rates()
    rows = db.scalars(
        select(CallAudit)
        .where(CallAudit.job_id.is_(None))
        .where(CallAudit.created_at >= since)
        .order_by(CallAudit.created_at)
    ).all()
    names: dict[str | None, str | None] = {}
    sessions: list[VoiceSessionView] = []
    for row in rows:
        meta = row.metadata_json or {}
        endpoint = meta.get("endpoint")
        if endpoint not in VOICE_ENDPOINTS:
            continue
        usage = meta.get("token_usage") or {}
        input_tokens = _first(usage, "promptTokenCount", "prompt_tokens", "input_tokens")
        output_tokens = _first(
            usage,
            "responseTokenCount",
            "candidatesTokenCount",
            "completion_tokens",
            "output_tokens",
        )
        if endpoint == "solo.voice":
            cost = (
                None
                if rates is None
                else round((input_tokens * rates[0] + output_tokens * rates[1]) / 1_000_000, 8)
            )
        else:
            recorded = meta.get("estimated_cost")
            cost = None if recorded is None else float(recorded)
        account_id = meta.get("account_id")
        if account_id not in names:
            account = db.get(Account, account_id) if account_id else None
            names[account_id] = account.username if account is not None else None
        sessions.append(
            VoiceSessionView(
                at=float(row.created_at),
                username=names[account_id],
                endpoint=endpoint,
                model=meta.get("actual_model") or meta.get("requested_model"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                audio_input_tokens=_audio(usage.get("promptTokensDetails")),
                audio_output_tokens=_audio(usage.get("responseTokensDetails")),
                cost=cost,
            )
        )
    voice = [s for s in sessions if s.endpoint == "solo.voice"]
    costs = [s.cost for s in sessions if s.cost is not None]
    return VoiceReportView(
        days=days,
        costed=rates is not None,
        sessions=sessions,
        totals=VoiceTotalsView(
            sessions=len(voice),
            input_tokens=sum(s.input_tokens for s in sessions),
            output_tokens=sum(s.output_tokens for s in sessions),
            cost=round(sum(costs), 8) if costs else None,
        ),
    )

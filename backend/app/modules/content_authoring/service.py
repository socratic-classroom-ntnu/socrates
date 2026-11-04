"""Application services owned by Content Authoring."""

from __future__ import annotations


from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.content_authoring.repositories import LibraryReceipt, Script
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import digest
from copy import deepcopy
from uuid import uuid4
from pydantic import ValidationError
from app.modules.content_authoring.contracts import Question
from app.modules.identity_access.repositories import Account
from app.modules.content_authoring.repositories import BankQuestion
import json
from app.modules.content_authoring.contracts import (
    PublicQuestion,
    SampleQuestionDraft,
    ScriptAssistRequest,
)
import time
from uuid import UUID, uuid5
from sqlalchemy import and_, func
from app.modules.content_authoring.contracts import ScriptDocument
from app.modules.content_authoring.contracts import (
    BankMutation,
    ImportQuestion,
    Publish,
)
from app.modules.content_authoring.contracts import (
    ScriptAssistResult,
)
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.storage import transaction
from app.modules.llm_runtime.service import guarded_generate
from app.modules.ai_providers.service import ProviderWait


def mutate(
    db: Session,
    account: Any,
    operation: str,
    body: Any,
    action: Callable[[], Any],
) -> Any:
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


def script_profile_check(db: Session, owner_id: str, profile_id: str) -> str | None:
    for script in db.scalars(select(Script).where(Script.owner_id == owner_id)):
        if any(
            (question.get("scenario_ai") or {}).get("provider_profile_id") == profile_id
            for question in (script.document or {}).get("questions", [])
        ):
            return "PROVIDER_PROFILE_IN_SCRIPT"
    return None


# Public surface for other modules (they import from service, not from these files).
from app.modules.content_authoring.ladder import (  # noqa: E402
    Stage as Stage,
)
from app.modules.content_authoring.ladder_repository import (  # noqa: E402
    LadderRepository as LadderRepository,
)
from app.modules.content_authoring.library_decisions import (  # noqa: E402
    visible_evidence as visible_evidence,
)
from app.modules.content_authoring.normalization import (  # noqa: E402
    ensure_other_options as ensure_other_options,
    ensure_other_question as ensure_other_question,
)
from app.modules.content_authoring.scenario_ai import (  # noqa: E402
    prune_scenario_ai as prune_scenario_ai,
    validate_scenario_ai as validate_scenario_ai,
)


# 每份劇本最多可放的題目數；加入題庫題目時超過就拒絕。
MAX_SCRIPT_QUESTIONS = 50


# 發布或加入時一律去掉的欄位：屬於原作者帳號或 AI 服務的設定，不能跟著題目流到別人的劇本。
STRIPPED_KEYS = ("scenario_ai", "provider_profile_id")


PAGE_LIMIT = 50


def user(db, request, mutation=False):
    from app.modules.identity_access.service import account

    return account(db, request, mutation)[0]


def _mutate(db, account, operation, body, action):
    from app.modules.content_authoring.service import mutate

    return mutate(db, account, operation, body, action)


def clean_question(value: dict) -> dict:
    """Validated copy of one question without owner/provider-specific settings."""
    raw = deepcopy(value) if isinstance(value, dict) else {}
    for key in STRIPPED_KEYS:
        raw.pop(key, None)
    try:
        question = Question.model_validate(raw).model_dump()
    except ValidationError as exc:
        raise DomainError("BANK_QUESTION_INVALID", 422) from exc
    for key in STRIPPED_KEYS:
        question.pop(key, None)
    return question


def _search_text(title: str, question: dict, tags: list[str]) -> str:
    parts = [title, question.get("title", ""), question.get("scenario", ""), *tags]
    parts += [option.get("text", "") for option in question.get("options", [])]
    return "\n".join(str(part) for part in parts).lower()


def _owned_script(db, script_id, account, lock=False):
    query = select(Script).where(Script.id == script_id)
    if lock:
        query = query.with_for_update()
    script = db.scalar(query)
    if script is None or script.owner_id != account.id:
        raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
    return script


def _view(db, row: BankQuestion, account, full=False) -> dict:
    owner = db.get(Account, row.owner_id)
    question = row.question
    item = {
        "id": row.id,
        "title": row.title,
        "tags": list(row.tags or []),
        "scenario_excerpt": question.get("scenario", "")[:160],
        "option_count": len(question.get("options", [])),
        "author": owner.username if owner else None,
        "mine": row.owner_id == account.id,
        "published_at": row.published_at,
        "revision": row.revision,
    }
    if full:
        item["question"] = deepcopy(question)
    if row.owner_id == account.id:
        item["source_script_id"] = row.source_script_id
        item["source_question_id"] = row.source_question_id
    return item


def _fresh_id(existing: set[str]) -> str:
    while True:
        candidate = "bank-" + uuid4().hex[:10]
        if candidate not in existing:
            return candidate


ROLE = "ai_script_authoring"


MAX_DRAFT_BYTES = 64 * 1024


OPTION_IDS = "abcdefgh"


TIMING_FIELDS = (
    "duration_seconds",
    "argument_required",
    "max_focus_turns",
    "focus_response_seconds",
    "sender_point_cap",
    "receiver_point_cap",
    "max_personal_turns",
    "personal_seconds",
)


def _brief(question) -> dict:
    """The parts of a draft question the model needs; never ids or routing."""
    if not isinstance(question, dict):
        return {}
    raw = question.get("options")
    options: list = raw if isinstance(raw, list) else []
    return {
        "title": str(question.get("title", ""))[:300],
        "scenario": str(question.get("scenario", ""))[:12000],
        "options": [
            str(option.get("text", ""))[:2000]
            for option in options
            if isinstance(option, dict) and option.get("id") != "__other__"
        ],
        "tutor_goal": str(question.get("tutor_goal", ""))[:2000],
        "probe_hints": [str(hint)[:500] for hint in question.get("probe_hints") or []][:10],
    }


def _draft_questions(document: dict) -> list:
    questions = document.get("questions")
    return questions if isinstance(questions, list) else []


def _assist_context(body: ScriptAssistRequest) -> dict:
    questions = _draft_questions(body.document)
    if body.question_index is not None and body.question_index >= len(questions):
        raise DomainError("QUESTION_REQUIRED", 422)
    context = {
        "request": body.request.strip(),
        "draft": {
            "title": str(body.document.get("title", ""))[:300],
            "mode": body.document.get("mode", "static"),
            "questions": [_brief(question) for question in questions],
        },
        "target": {
            "target_question_index": body.question_index,
            "target_question": _brief(questions[body.question_index])
            if body.question_index is not None
            else None,
        },
    }
    if len(json.dumps(context, ensure_ascii=False).encode()) > MAX_DRAFT_BYTES:
        raise DomainError("SCRIPT_ASSIST_DRAFT_SIZE", 413)
    return context


def build_question(result: dict, target: dict | None) -> dict:
    """Turn the model's suggestion into a Question the script validator accepts."""
    texts = [text.strip() for text in result["options"] if text.strip() and text.strip() != "其他"][
        : len(OPTION_IDS)
    ]
    question = {
        "id": str(target["id"])
        if target and isinstance(target.get("id"), str) and target["id"]
        else "ai-" + uuid4().hex[:10],
        "title": result["title"].strip(),
        "scenario": result["scenario"].strip(),
        "options": [{"id": OPTION_IDS[i], "text": text} for i, text in enumerate(texts)],
        "tutor_goal": result["tutor_goal"].strip(),
        "probe_hints": [hint.strip() for hint in result["probe_hints"] if hint.strip()],
    }
    timing = {key: target[key] for key in TIMING_FIELDS if target and key in target}
    for candidate in ({**question, **timing}, question):
        try:
            return PublicQuestion.model_validate(candidate).model_dump()
        except ValidationError:
            continue
    raise DomainError("SCRIPT_ASSIST_INVALID_OUTPUT", 422)


def sample_questions(path: str | None = None) -> dict:
    """The ladder's stages as Questions; raises SCRIPT_SAMPLES_UNAVAILABLE when unreadable."""
    from app.modules.platform.config import settings

    try:
        ladder = LadderRepository.load(path or settings.ladder_path).get()
    except (OSError, ValueError) as exc:
        raise DomainError("SCRIPT_SAMPLES_UNAVAILABLE", 503) from exc
    questions = []
    for stage in ladder.stages:
        question = {
            "id": "sample-" + stage.key,
            "title": stage.title.strip(),
            "scenario": stage.opening_statement.strip(),
            "options": [],
            "tutor_goal": stage.teaching_goal.strip(),
            "probe_hints": [hint.strip() for hint in stage.probe_hints if hint.strip()],
            "max_personal_turns": min(stage.max_turns, 20),
        }
        try:
            questions.append(SampleQuestionDraft.model_validate(question).model_dump())
        except ValidationError:
            continue
    return {"title": ladder.title, "questions": questions}


def publish_questions(db, account, body: Publish):
    def action():
        script = _owned_script(db, body.script_id, account)
        source = next(
            (
                q
                for q in script.document.get("questions", [])
                if isinstance(q, dict) and q.get("id") == body.question_id
            ),
            None,
        )
        if source is None:
            raise DomainError("BANK_SOURCE_QUESTION_REQUIRED", 404)
        question = clean_question(source)
        title = (body.title or "").strip() or question["title"]
        # 同一份劇本的同一題再次發布＝更新原本那筆，而不是多一筆重複的題目。
        row = db.scalar(
            select(BankQuestion)
            .where(
                BankQuestion.owner_id == account.id,
                BankQuestion.source_script_id == script.id,
                BankQuestion.source_question_id == body.question_id,
            )
            .with_for_update()
        )
        if row is None:
            row = BankQuestion(
                id=str(uuid5(UUID(account.id), "bank-question:" + body.action_id)),
                owner_id=account.id,
                source_script_id=script.id,
                source_question_id=body.question_id,
                revision=1,
            )
            db.add(row)
        else:
            row.revision += 1
        row.title = title
        row.question = question
        row.tags = body.tags
        row.search_text = _search_text(title, question, body.tags)
        row.published_at = time.time()
        db.flush()
        return _view(db, row, account, full=True)

    return _mutate(db, account, "bank-publish", body, action)


def search_bank(db, account, q: str, offset: int, limit: int, mine: bool):
    conditions = [
        BankQuestion.search_text.contains(term, autoescape=True) for term in q.lower().split()[:8]
    ]
    if mine:
        conditions.append(BankQuestion.owner_id == account.id)
    where = and_(*conditions) if conditions else None
    count = select(func.count()).select_from(BankQuestion)
    rows = select(BankQuestion).order_by(BankQuestion.published_at.desc(), BankQuestion.id)
    if where is not None:
        count = count.where(where)
        rows = rows.where(where)
    total = db.scalar(count) or 0
    items = db.scalars(rows.offset(offset).limit(limit)).all()
    return {
        "items": [_view(db, row, account) for row in items],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


def unpublish_question(db, account, bank_id: str, body: BankMutation):
    def action():
        row = db.scalar(select(BankQuestion).where(BankQuestion.id == bank_id).with_for_update())
        if row is None:
            raise DomainError("BANK_QUESTION_REQUIRED", 404)
        if row.owner_id != account.id:
            raise DomainError("BANK_OWNER_REQUIRED", 403)
        db.delete(row)
        db.flush()
        return {"id": bank_id, "status": "UNPUBLISHED"}

    return _mutate(db, account, "bank-unpublish:" + bank_id, body, action)


def import_bank_question(db, account, bank_id: str, body: ImportQuestion):
    def action():
        row = db.get(BankQuestion, bank_id)
        if row is None:
            raise DomainError("BANK_QUESTION_REQUIRED", 404)
        script = _owned_script(db, body.script_id, account, lock=True)
        document = deepcopy(script.document)
        questions = document.setdefault("questions", [])
        if len(questions) >= MAX_SCRIPT_QUESTIONS:
            raise DomainError("BANK_SCRIPT_QUESTION_LIMIT", 422)
        question = clean_question(row.question)
        question["id"] = _fresh_id({str(q.get("id")) for q in questions if isinstance(q, dict)})
        questions.append(question)
        try:
            saved = ScriptDocument.model_validate(document).model_dump()
        except ValidationError as exc:
            raise DomainError("BANK_IMPORT_INVALID", 422) from exc
        script.document = saved
        script.revision += 1
        db.flush()
        return {
            "id": script.id,
            "revision": script.revision,
            "question_id": question["id"],
            "document": script.document,
        }

    return _mutate(db, account, "bank-import:" + bank_id, body, action)


async def assist_script(actor, session, body: ScriptAssistRequest):
    from app.modules.ai_providers.repositories import AccountAISettings
    from app.modules.ai_providers.service import (
        settings_view as account_settings_view,
        provider_error_status,
        record_direct_call_audit,
        resolve_request_chain,
    )
    from app.modules.llm_runtime.service import compile_program

    with transaction() as db:
        if body.script_id:
            script = db.get(Script, body.script_id)
            if script is None or script.owner_id != actor.id:
                raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        context = _assist_context(body)
        model = account_settings_view(db.get(AccountAISettings, actor.id))["model_matrix"].get(ROLE)
        if not model:
            raise DomainError("SCRIPT_ASSIST_MODEL_REQUIRED", 409)
        bindings, _ = resolve_request_chain(
            db, account=actor, session=session, role=ROLE, model=model
        )
        if not bindings:
            raise DomainError("SCRIPT_ASSIST_PROVIDER_REQUIRED", 409)
        enforce_rate_limit(db, f"script-assist:{actor.id}", 20, 60)
        messages, schema, _ = compile_program(db, ROLE, context)

    async def no_delta(_):
        return None

    failure: DomainError | None = None
    for binding in bindings:
        started = time.monotonic()
        try:
            result, audit = await guarded_generate(
                binding, messages, schema, no_delta, kind=ROLE, context=context
            )
            result = ScriptAssistResult.model_validate(result).model_dump()
            questions = _draft_questions(body.document)
            target = questions[body.question_index] if body.question_index is not None else None
            response = {
                "question": build_question(result, target if isinstance(target, dict) else None),
                "question_index": body.question_index,
                "rationale": result["rationale"].strip(),
                "model": audit.get("actual_model"),
                "provider": audit.get("provider"),
            }
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="scripts.assist",
                role=ROLE,
                binding=binding,
                state="READY",
                audit=audit,
            )
            return response
        except ProviderWait as exc:
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="scripts.assist",
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=exc.reason,
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            failure = DomainError(exc.reason, provider_error_status(exc.reason))
        except DomainError as exc:
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="scripts.assist",
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=exc.code,
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            failure = DomainError(exc.code, provider_error_status(exc.code))
        except (ValidationError, KeyError, IndexError, TypeError, ValueError):
            reason = "SCRIPT_ASSIST_INVALID_OUTPUT"
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="scripts.assist",
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=reason,
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            failure = DomainError(reason, provider_error_status(reason))
    assert failure is not None
    raise failure

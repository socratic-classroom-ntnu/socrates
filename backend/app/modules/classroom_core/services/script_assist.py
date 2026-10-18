"""Application service for AI-assisted script authoring."""

from __future__ import annotations

import json
import time
from uuid import uuid4

from pydantic import ValidationError

from app.modules.ai_providers.api.routes.provider_profiles import (
    AccountAISettings,
    _settings_view,
    provider_error_status,
    record_direct_call_audit,
    resolve_request_chain,
)
from app.modules.classroom_core.api.classroom_schemas import (
    PublicQuestion,
    ScriptAssistRequest,
    ScriptAssistResult,
)
from app.modules.classroom_core.orchestrator.classroom import DomainError
from app.modules.classroom_core.services import classroom as classroom_service
from app.modules.llm_runtime.tutor import classroom_gateway
from app.modules.llm_runtime.tutor.classroom_provider import ProviderWait
from app.modules.llm_runtime.tutor.prompts import compile_program
from app.modules.platform.repositories.classroom_storage import Script

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
    """Return only the draft fields needed by the model, never ids or routing."""
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
            "target_question": (
                _brief(questions[body.question_index]) if body.question_index is not None else None
            ),
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
        "id": (
            str(target["id"])
            if target and isinstance(target.get("id"), str) and target["id"]
            else "ai-" + uuid4().hex[:10]
        ),
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


def prepare(db, actor, session, body: ScriptAssistRequest) -> dict:
    """Resolve authorization, routing, budget, and prompt inside one DB transaction."""
    if body.script_id:
        script = db.get(Script, body.script_id)
        if script is None or script.owner_id != actor.id:
            raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
    context = _assist_context(body)
    model = _settings_view(db.get(AccountAISettings, actor.id))["model_matrix"].get(ROLE)
    if not model:
        raise DomainError("SCRIPT_ASSIST_MODEL_REQUIRED", 409)
    bindings, _ = resolve_request_chain(
        db,
        account=actor,
        session=session,
        role=ROLE,
        model=model,
    )
    if not bindings:
        raise DomainError("SCRIPT_ASSIST_PROVIDER_REQUIRED", 409)
    classroom_service.limit(db, f"script-assist:{actor.id}", 20, 60)
    messages, schema, _ = compile_program(db, ROLE, context)
    return {
        "actor_id": actor.id,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
    }


async def assist(body: ScriptAssistRequest, prepared: dict) -> dict:
    """Call the provider chain and turn the first valid response into an API result."""

    async def no_delta(_):
        return None

    failure: DomainError | None = None
    for binding in prepared["bindings"]:
        started = time.monotonic()
        try:
            result, audit = await classroom_gateway.generate(
                binding,
                prepared["messages"],
                prepared["schema"],
                no_delta,
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
                actor_id=prepared["actor_id"],
                endpoint="scripts.assist",
                role=ROLE,
                binding=binding,
                state="READY",
                audit=audit,
            )
            return response
        except ProviderWait as exc:
            record_direct_call_audit(
                actor_id=prepared["actor_id"],
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
                actor_id=prepared["actor_id"],
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
                actor_id=prepared["actor_id"],
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

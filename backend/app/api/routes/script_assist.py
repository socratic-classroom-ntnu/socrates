"""AI 協助設計：the teacher's request + current draft → one validated question suggestion.

Routing is the account's ai_script_authoring role (model matrix) on its default/fallback
profiles; the prompt program lives in prompts/classroom/programs.json like every LLM use case.
GET /scripts/samples serves the repository's sample scenarios (the ladder file) as questions
the editor can drop into a draft.
"""

from __future__ import annotations

import json
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import ValidationError

from app.api.classroom_schemas import PublicQuestion, ScriptAssistRequest, ScriptAssistResult
from app.orchestrator.classroom import DomainError
from app.repositories.classroom_storage import Script, transaction
from app.tutor import classroom_gateway
from app.tutor.classroom_provider import ProviderWait

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

router = APIRouter()


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
    raise DomainError("SCRIPT_ASSIST_INVALID_OUTPUT", 502)


@router.post("/scripts/assist")
async def script_assist(body: ScriptAssistRequest, request: Request):
    from app.api.routes.classroom import account
    from app.api.routes.provider_profiles import (
        AccountAISettings,
        _settings_view,
        resolve_request_chain,
    )
    from app.services import classroom as service
    from app.tutor.prompts import compile_program

    with transaction() as db:
        actor, session = account(db, request, True)
        if body.script_id:
            script = db.get(Script, body.script_id)
            if script is None or script.owner_id != actor.id:
                raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        context = _assist_context(body)
        model = _settings_view(db.get(AccountAISettings, actor.id))["model_matrix"].get(ROLE)
        if not model:
            raise DomainError("SCRIPT_ASSIST_MODEL_REQUIRED", 409)
        bindings, _ = resolve_request_chain(
            db, account=actor, session=session, role=ROLE, model=model
        )
        if not bindings:
            raise DomainError("SCRIPT_ASSIST_PROVIDER_REQUIRED", 409)
        service.limit(db, f"script-assist:{actor.id}", 20, 60)
        messages, schema, _ = compile_program(db, ROLE, context)

    async def no_delta(_):
        return None

    failure: DomainError | None = None
    for binding in bindings:
        try:
            result, audit = await classroom_gateway.generate(binding, messages, schema, no_delta)
            result = ScriptAssistResult.model_validate(result).model_dump()
        except ProviderWait as exc:
            failure = DomainError(exc.reason, 502)
            continue
        except DomainError as exc:
            failure = exc
            continue
        except (ValidationError, KeyError, IndexError, TypeError, ValueError):
            failure = DomainError("SCRIPT_ASSIST_INVALID_OUTPUT", 502)
            continue
        questions = _draft_questions(body.document)
        target = questions[body.question_index] if body.question_index is not None else None
        return {
            "question": build_question(result, target if isinstance(target, dict) else None),
            "question_index": body.question_index,
            "rationale": result["rationale"].strip(),
            "model": audit.get("actual_model"),
            "provider": audit.get("provider"),
        }
    assert failure is not None
    raise failure


# 範例題目的來源是 ladder 檔（預設 ladders/trolley.yaml，部署時由 LADDER_PATH 指定）：標題、情境、
# 教學目標與備用追問都照原文。ladder 只寫「你會怎麼做？」而沒有選項，所以每一階的兩個立場在這裡列出，
# 用字取自該階 opening_statement 給的行動與 probe_hints 對兩種回答的稱呼。沒有列在這裡的階段不提供，
# 不替它編選項。
SAMPLE_OPTIONS: dict[str, tuple[str, ...]] = {
    "trolley_basic": ("把電車轉向岔道", "不轉向"),
    "footbridge": ("把他推落軌道", "不推他"),
    "transplant": ("取出他的器官", "不取出他的器官"),
}


def sample_questions(path: str | None = None) -> dict:
    """The ladder's stages as Questions; raises SCRIPT_SAMPLES_UNAVAILABLE when unreadable."""
    from app.config import settings
    from app.ladders.repository import LadderRepository

    try:
        ladder = LadderRepository.load(path or settings.ladder_path).get()
    except (OSError, ValueError) as exc:
        raise DomainError("SCRIPT_SAMPLES_UNAVAILABLE", 503) from exc
    questions = []
    for stage in ladder.stages:
        texts = SAMPLE_OPTIONS.get(stage.key)
        if not texts:
            continue
        question = {
            "id": "sample-" + stage.key,
            "title": stage.title.strip(),
            "scenario": stage.opening_statement.strip(),
            "options": [{"id": OPTION_IDS[i], "text": text} for i, text in enumerate(texts)],
            "tutor_goal": stage.teaching_goal.strip(),
            "probe_hints": [hint.strip() for hint in stage.probe_hints if hint.strip()],
            "max_personal_turns": min(stage.max_turns, 20),
        }
        try:
            questions.append(PublicQuestion.model_validate(question).model_dump())
        except ValidationError:
            continue
    return {"title": ladder.title, "questions": questions}


@router.get("/scripts/samples")
def script_samples(request: Request):
    from app.api.routes.classroom import account

    with transaction() as db:
        account(db, request)
    return sample_questions()

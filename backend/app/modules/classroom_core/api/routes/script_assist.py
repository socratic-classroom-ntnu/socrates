"""AI 協助設計：the teacher's request + current draft → one validated question suggestion.

Routing is the account's ai_script_authoring role (model matrix) on its default/fallback
profiles; the prompt program lives in prompts/classroom/programs.json like every LLM use case.
GET /scripts/samples serves the repository's sample scenarios (the ladder file) as questions
the editor can drop into a draft.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import ValidationError

from app.modules.classroom_core.api.classroom_schemas import (
    SampleQuestionDraft,
    SampleQuestionSet,
    ScriptAssistRequest,
)
from app.modules.classroom_core.api.request_account import account
from app.modules.classroom_core.orchestrator.classroom import DomainError
from app.modules.classroom_core.services import script_assist as assist_service
from app.modules.platform.repositories.classroom_storage import transaction

router = APIRouter()


@router.post("/scripts/assist")
async def script_assist(body: ScriptAssistRequest, request: Request):
    with transaction() as db:
        actor, session = account(db, request, True)
        prepared = assist_service.prepare(db, actor, session, body)
    return await assist_service.assist(body, prepared)


# 範例題目的來源是 ladder 檔（預設 ladders/trolley.yaml，部署時由 LADDER_PATH 指定）。
# 標題、情境、教學目標與備用追問照原文；選項保持空陣列，交給老師在草稿中填寫。


def sample_questions(path: str | None = None) -> dict:
    """The ladder's stages as Questions; raises SCRIPT_SAMPLES_UNAVAILABLE when unreadable."""
    from app.modules.platform.config import settings
    from app.modules.content_authoring.ladders.repository import LadderRepository

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


@router.get("/scripts/samples", response_model=SampleQuestionSet)
def script_samples(request: Request):
    with transaction() as db:
        account(db, request)
    return sample_questions()

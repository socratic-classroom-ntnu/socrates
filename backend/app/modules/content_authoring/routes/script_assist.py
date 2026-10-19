"""AI 協助設計：the teacher's request + current draft → one validated question suggestion.

Routing is the account's ai_script_authoring role (model matrix) on its default/fallback
profiles; the prompt program lives in prompts/classroom/programs.json like every LLM use case.
GET /scripts/samples serves the repository's sample scenarios (the ladder file) as questions
the editor can drop into a draft.
"""

from __future__ import annotations


from fastapi import APIRouter, Request

from app.modules.content_authoring.contracts import (
    SampleQuestionSet,
    ScriptAssistRequest,
)
from app.modules.platform.storage import transaction
from app.modules.content_authoring.service import (
    sample_questions,
)
from app.modules.content_authoring.service import assist_script


router = APIRouter()


@router.post("/scripts/assist")
async def script_assist(body: ScriptAssistRequest, request: Request):
    from app.modules.identity_access.service import account

    with transaction() as db:
        actor, session = account(db, request, True)
    return await assist_script(actor, session, body)


# 範例題目的來源是 ladder 檔（預設 ladders/trolley.yaml，部署時由 LADDER_PATH 指定）。
# 標題、情境、教學目標與備用追問照原文；選項保持空陣列，交給老師在草稿中填寫。


@router.get("/scripts/samples", response_model=SampleQuestionSet)
def script_samples(request: Request):
    from app.modules.identity_access.service import account

    with transaction() as db:
        account(db, request)
    return sample_questions()

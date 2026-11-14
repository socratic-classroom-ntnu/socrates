"""Solo activity routes under /solo: attempts, the teacher's live progress and statistics.

Not under /activities/...: course_management's ``POST /activities/{id}/{action}`` would take
these requests first. Actions follow the state-machine convention ``POST /{resource}/{id}/{action}``
and are 1:1 with ``available_actions``. A provider call runs outside the transaction that saved
the student's message (AGENTS.md: 學生訊息先落地才呼叫 provider).
"""

from typing import Annotated

from fastapi import APIRouter, Body, Request
from fastapi.exceptions import RequestValidationError

from app.modules.identity_access.service import account
from app.modules.platform.storage import transaction
from app.modules.solo_activity import analysis, progress
from app.modules.solo_activity import service as service
from app.modules.solo_activity.contracts import (
    ACTION_BODIES,
    SoloActionBody,
    SoloActivityAnalysisView,
    SoloActivityProgressView,
    SoloActivityView,
    SoloAttemptView,
    SoloAction,
)

router = APIRouter(prefix="/solo", tags=["solo"])


@router.get("/activities/{activity_id}", response_model=SoloActivityView)
def get_solo_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return service.activity_view(db, current, activity_id, service.now())


@router.post("/activities/{activity_id}/attempt", response_model=SoloAttemptView)
def start_attempt(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        return service.start(db, current, activity_id, service.now())


@router.get("/attempts/{attempt_id}", response_model=SoloAttemptView)
def get_attempt(attempt_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return service.attempt_view(db, current, attempt_id, service.now())


@router.post("/attempts/{attempt_id}/{action}", response_model=SoloAttemptView)
async def act_on_attempt(
    attempt_id: str,
    action: SoloAction,
    request: Request,
    body: Annotated[SoloActionBody | None, Body()] = None,
):
    expected = ACTION_BODIES.get(action)
    if (expected is None) != (body is None) or (expected and not isinstance(body, expected)):
        if expected is not None and body is None:
            # Without its body an action that is not offered now is refused as unavailable.
            with transaction() as db:
                current, _ = account(db, request)
                service.ensure_available(db, current, attempt_id, action, service.now())
        raise RequestValidationError(
            [{"type": "body_mismatch", "loc": ("body",), "msg": f"{action} body", "input": None}]
        )
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        prepared = service.begin_action(db, current, attempt_id, action, body, service.now())
    return await service.finish_action(prepared)


@router.get("/activities/{activity_id}/progress", response_model=SoloActivityProgressView)
def get_activity_progress(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return progress.progress_view(db, current, activity_id, progress.now())


@router.get("/activities/{activity_id}/analysis", response_model=SoloActivityAnalysisView)
def get_activity_analysis(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return analysis.analysis_view(db, current, activity_id, progress.now())

"""Solo activity routes under /solo: attempts, the teacher's live progress, statistics and radar.

Not under /activities/...: course_management's ``POST /activities/{id}/{action}`` would take
these requests first. Actions follow the state-machine convention ``POST /{resource}/{id}/{action}``
and are 1:1 with ``available_actions``. A provider call runs outside the transaction that saved
the student's message (AGENTS.md: 學生訊息先落地才呼叫 provider).
"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Body, Request
from fastapi.exceptions import RequestValidationError

from app.modules.identity_access.service import account
from app.modules.platform.storage import transaction
from app.modules.solo_activity import analysis, practice, progress, radar, roster, teacher_attempt
from app.modules.solo_activity import service as service
from app.modules.solo_activity.contracts import (
    ACTION_BODIES,
    RadarDimensionUpdate,
    RadarView,
    SoloActionBody,
    SoloActivityAnalysisView,
    SoloActivityProgressView,
    SoloActivityView,
    SoloAttemptView,
    SoloAction,
    PracticeList,
    PracticeStart,
    PracticeStarted,
    PracticeTopic,
    SoloCourseRosterView,
    TeacherTranscriptView,
)

router = APIRouter(prefix="/solo", tags=["solo"])


@router.get("/practice/bank", response_model=list[PracticeTopic])
def get_practice_bank(request: Request):
    """The main-flow bank; guests may read it (their 我的對話 page shows the topics locked)."""
    with transaction() as db:
        account(db, request, allow_guest=True)
        return practice.bank_view()


@router.get("/practice", response_model=PracticeList)
def get_practice(request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return practice.practice_list(db, current, service.now())


@router.post("/practice", response_model=PracticeStarted, status_code=201)
def start_practice(body: PracticeStart, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        return practice.start_practice(db, current, body.bank_item_id, service.now())


@router.get("/activities/{activity_id}", response_model=SoloActivityView)
def get_solo_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, allow_guest=True)
        return service.activity_view(db, current, activity_id, service.now())


@router.post("/activities/{activity_id}/attempt", response_model=SoloAttemptView)
def start_attempt(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True, allow_guest=True)
        return service.start(db, current, activity_id, service.now())


@router.get("/attempts/{attempt_id}", response_model=SoloAttemptView)
def get_attempt(attempt_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, allow_guest=True)
        return service.attempt_view(db, current, attempt_id, service.now())


@router.post("/attempts/{attempt_id}/{action}", response_model=SoloAttemptView)
async def act_on_attempt(
    attempt_id: str,
    action: SoloAction,
    request: Request,
    background: BackgroundTasks,
    body: Annotated[SoloActionBody | None, Body()] = None,
):
    expected = ACTION_BODIES.get(action)
    if (expected is None) != (body is None) or (expected and not isinstance(body, expected)):
        if expected is not None and body is None:
            # Without its body an action that is not offered now is refused as unavailable.
            with transaction() as db:
                current, _ = account(db, request, allow_guest=True)
                service.ensure_available(db, current, attempt_id, action, service.now())
        raise RequestValidationError(
            [{"type": "body_mismatch", "loc": ("body",), "msg": f"{action} body", "input": None}]
        )
    with transaction() as db:
        current, _ = account(db, request, mutation=True, allow_guest=True)
        prepared = service.begin_action(db, current, attempt_id, action, body, service.now())
    return await service.finish_action(
        prepared, lambda final: background.add_task(service.write_final, final)
    )


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


@router.get("/activities/{activity_id}/radar", response_model=RadarView)
async def get_activity_radar(activity_id: str, request: Request):
    """The kept radar, or a new one when a final summary was added or changed since.

    Computing calls the teacher's provider outside the transaction; RADAR_NOT_READY when no
    student has a kept final summary yet or no radar could be computed.
    """
    with transaction() as db:
        current, _ = account(db, request)
        prepared = radar.begin_radar(db, current, activity_id, radar.now())
    return await radar.finish_radar(prepared)


@router.patch("/activities/{activity_id}/radar/dimensions/{index}", response_model=RadarView)
def rename_radar_dimension(
    activity_id: str, index: int, body: RadarDimensionUpdate, request: Request
):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        return radar.rename_dimension(db, current, activity_id, index, body.name)


@router.get("/courses/{course_id}/students", response_model=SoloCourseRosterView)
def get_course_roster(course_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return roster.roster_view(db, current, course_id, progress.now())


@router.get(
    "/activities/{activity_id}/students/{enrollment_id}/attempt",
    response_model=TeacherTranscriptView,
)
def get_student_attempt(
    activity_id: str, enrollment_id: str, request: Request, after: str | None = None
):
    """One student's whole conversation, for the course owner; read only.

    ``after`` is a message id: only the messages after it come back (the page's refresh). A GET
    under /activities, so POST /solo/attempts/{id}/{action} never takes it.
    """
    with transaction() as db:
        current, _ = account(db, request)
        return teacher_attempt.transcript_view(
            db, current, activity_id, enrollment_id, teacher_attempt.now(), after
        )

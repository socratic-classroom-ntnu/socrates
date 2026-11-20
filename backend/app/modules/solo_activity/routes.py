"""Solo activity routes under /solo: attempts, the teacher's live progress, statistics and radar.

Not under /activities/...: course_management's ``POST /activities/{id}/{action}`` would take
these requests first. Actions follow the state-machine convention ``POST /{resource}/{id}/{action}``
and are 1:1 with ``available_actions``. A provider call runs outside the transaction that saved
the student's message (AGENTS.md: 學生訊息先落地才呼叫 provider).
"""

import asyncio
import time
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Body, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError

from app.modules.ai_providers.service import open_voice_session
from app.modules.identity_access import service as auth
from app.modules.identity_access.service import account, same_origin
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction
from app.modules.solo_activity import analysis, practice, progress, radar, roster, teacher_attempt
from app.modules.solo_activity import service as service
from app.modules.solo_activity import voice_relay
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


# ---- voice mode ---------------------------------------------------------------------------


@router.websocket("/attempts/{attempt_id}/voice")
async def voice(ws: WebSocket, attempt_id: str):
    """The browser's only voice connection: microphone audio in; Socrates' audio, captions and
    the attempt view out. Text frames from the browser are ignored: it cannot send the voice
    model's instructions or either side's transcript (voice_relay keeps both on the backend).
    """
    try:
        same_origin(ws)

        def identify() -> str:
            with transaction() as db:
                who, _ = auth.identity(db, ws.cookies.get(auth.COOKIE))
                voice_relay.available(db, who, attempt_id, time.time())
                return who.id

        account_id = await asyncio.to_thread(identify)
    except DomainError as exc:
        await ws.close(code=4403 if exc.status in (401, 403) else 4409)
        return
    await ws.accept()

    async def send_json(message: dict) -> None:
        if message.get("type") == "view":
            message = {
                **message,
                "view": SoloAttemptView.model_validate(message["view"]).model_dump(mode="json"),
            }
        await ws.send_json(message)

    relay = voice_relay.VoiceRelay(
        account_id=account_id,
        attempt_id=attempt_id,
        open_live=open_voice_session,
        send_json=send_json,
        send_audio=ws.send_bytes,
    )
    try:
        await relay.start()
    except Exception:  # noqa: BLE001 — no voice session: the student keeps typing
        await ws.send_json(
            {"type": "to_typing", "reason": "error", "text": voice_relay.TO_TYPING_TEXT["error"]}
        )
        await ws.close()
        return
    runner = asyncio.create_task(relay.run())
    try:
        while not runner.done():
            incoming = asyncio.create_task(ws.receive())
            done, _ = await asyncio.wait({incoming, runner}, return_when=asyncio.FIRST_COMPLETED)
            if incoming not in done:
                incoming.cancel()
                break
            frame = incoming.result()
            if frame["type"] == "websocket.disconnect":
                break
            if frame.get("bytes"):
                await relay.from_browser(frame["bytes"])
    except WebSocketDisconnect:
        pass
    finally:
        await relay.close()
        if not runner.done():
            runner.cancel()
        try:
            await ws.close()
        except RuntimeError:
            pass

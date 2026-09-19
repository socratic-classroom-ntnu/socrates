import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_learner_id, get_service
from app.api.schemas import SessionView, SummaryView
from app.orchestrator.orchestrator import ConversationEnded, InvalidAction
from app.services.conversation import ConversationService, Forbidden, NotFound
from app.tutor.gateway import TutorUnavailable

router = APIRouter(prefix="/api/sessions", tags=["summaries"])


@router.post("/{session_id}/end", response_model=SessionView)
def end_session(
    session_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SessionView:
    try:
        return service.end(session_id, learner_id)
    except Forbidden:
        raise HTTPException(status_code=403, detail="不是你的 session")
    except NotFound:
        raise HTTPException(status_code=404, detail="找不到 session")
    except ConversationEnded as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{session_id}/summary", status_code=201, response_model=SummaryView)
def create_summary(
    session_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SummaryView:
    try:
        return service.generate_summary(session_id, learner_id)
    except Forbidden:
        raise HTTPException(status_code=403, detail="不是你的 session")
    except NotFound:
        raise HTTPException(status_code=404, detail="找不到 session")
    except InvalidAction as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except TutorUnavailable:
        raise HTTPException(status_code=503, detail="整理失敗，請重試")


@router.get("/{session_id}/summary", response_model=SummaryView)
def read_summary(
    session_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SummaryView:
    try:
        return service.get_summary(session_id, learner_id)
    except Forbidden:
        raise HTTPException(status_code=403, detail="不是你的 session")
    except NotFound:
        raise HTTPException(status_code=404, detail="總結尚未產生")

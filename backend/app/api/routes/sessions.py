import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_learner_id, get_service
from app.api.schemas import CreateSessionRequest, SessionDetail, SessionView
from app.services.conversation import ActiveSessionExists, ConversationService, Forbidden, NotFound

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", status_code=201, response_model=SessionView)
def create_session(
    payload: CreateSessionRequest,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SessionView:
    try:
        return service.start(learner_id, payload.restart_existing)
    except ActiveSessionExists as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "active_session_exists", "session_id": str(exc.session_id)},
        ) from exc


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SessionDetail:
    try:
        return service.detail(session_id, learner_id)
    except Forbidden:
        raise HTTPException(status_code=403, detail="不是你的 session")
    except NotFound:
        raise HTTPException(status_code=404, detail="找不到 session")

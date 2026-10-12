import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_learner_id, get_service
from app.api.room_schemas import ConversationRoomView
from app.services.conversation import ConversationService, Forbidden, NotFound
from app.services.room_view import build_room_view

router = APIRouter(prefix="/api/sessions", tags=["room"])


@router.get("/{session_id}/room", response_model=ConversationRoomView)
def get_room(
    session_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> ConversationRoomView:
    try:
        return build_room_view(service.detail(session_id, learner_id))
    except Forbidden as exc:
        raise HTTPException(status_code=403, detail="不是你的 session") from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail="找不到 session") from exc

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_learner_id, get_service
from app.api.schemas import SessionView
from app.orchestrator.orchestrator import ConversationEnded, InvalidAction
from app.services.conversation import ConversationService, Forbidden, NotFound
from app.tutor.gateway import TutorUnavailable

router = APIRouter(prefix="/api/sessions", tags=["messages"])


class SendMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("訊息不可為空白")
        return value


@router.post("/{session_id}/messages", response_model=SessionView)
def send_message(
    session_id: uuid.UUID,
    payload: SendMessageRequest,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SessionView:
    try:
        return service.send_message(session_id, learner_id, payload.text)
    except Forbidden:
        raise HTTPException(status_code=403, detail="不是你的 session")
    except NotFound:
        raise HTTPException(status_code=404, detail="找不到 session")
    except (ConversationEnded, InvalidAction) as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except TutorUnavailable:
        raise HTTPException(status_code=503, detail="教授那邊斷線了，請稍後重試")


@router.post("/{session_id}/retry", response_model=SessionView)
def retry(
    session_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    service: Annotated[ConversationService, Depends(get_service)],
) -> SessionView:
    try:
        return service.retry(session_id, learner_id)
    except Forbidden:
        raise HTTPException(status_code=403, detail="不是你的 session")
    except NotFound:
        raise HTTPException(status_code=404, detail="找不到 session")
    except (ConversationEnded, InvalidAction) as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except TutorUnavailable:
        raise HTTPException(status_code=503, detail="教授那邊還是斷線，請稍後重試")

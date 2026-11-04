import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as OrmSession

from app.modules.solo_dialogue import deps
from app.modules.solo_dialogue.deps import get_db, get_learner_id
from app.modules.solo_dialogue.history_schemas import SessionHistoryPage
from app.modules.solo_dialogue.history import HistoryService

router = APIRouter(prefix="/api/sessions", tags=["history"])


@router.get("", response_model=SessionHistoryPage)
def list_sessions(
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    db: Annotated[OrmSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 30,
    cursor: str | None = None,
) -> SessionHistoryPage:
    return HistoryService(db, deps.ladder_repository).list_sessions(
        learner_id,
        limit=limit,
        cursor=cursor,
    )

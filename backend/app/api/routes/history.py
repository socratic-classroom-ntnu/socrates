import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as OrmSession

from app.api.deps import get_db, get_learner_id
from app.api.history_schemas import SessionHistoryPage
from app.services.history import HistoryService

router = APIRouter(prefix="/api/sessions", tags=["history"])


@router.get("", response_model=SessionHistoryPage)
def list_sessions(
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    db: Annotated[OrmSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 30,
    cursor: str | None = None,
) -> SessionHistoryPage:
    import app.main as main

    return HistoryService(db, main.ladder_repository).list_sessions(
        learner_id,
        limit=limit,
        cursor=cursor,
    )

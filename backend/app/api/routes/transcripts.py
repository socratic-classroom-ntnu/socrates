import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as OrmSession

from app.api.deps import get_db, get_learner_id
from app.api.transcript_schemas import TranscriptDraftCreate, TranscriptDraftView
from app.repositories.transcript_repository import TranscriptForbidden, TranscriptNotFound
from app.services.transcripts import TranscriptService

router = APIRouter(prefix="/api/sessions", tags=["transcripts"])


@router.post("/{session_id}/transcript-drafts", status_code=201, response_model=TranscriptDraftView)
def create_transcript_draft(
    session_id: uuid.UUID,
    payload: TranscriptDraftCreate,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    db: Annotated[OrmSession, Depends(get_db)],
) -> TranscriptDraftView:
    try:
        return TranscriptService(db).create(session_id, learner_id, payload)
    except TranscriptForbidden as exc:
        raise HTTPException(status_code=403, detail="不是你的 session") from exc
    except TranscriptNotFound as exc:
        raise HTTPException(status_code=404, detail="找不到 session") from exc


@router.post(
    "/{session_id}/transcript-drafts/{draft_id}/confirm",
    response_model=TranscriptDraftView,
)
def confirm_transcript_draft(
    session_id: uuid.UUID,
    draft_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    db: Annotated[OrmSession, Depends(get_db)],
) -> TranscriptDraftView:
    try:
        return TranscriptService(db).confirm(session_id, learner_id, draft_id)
    except TranscriptForbidden as exc:
        raise HTTPException(status_code=403, detail="不是你的 transcript draft") from exc
    except TranscriptNotFound as exc:
        raise HTTPException(status_code=404, detail="找不到 transcript draft") from exc


@router.delete(
    "/{session_id}/transcript-drafts/{draft_id}",
    response_model=TranscriptDraftView,
)
def discard_transcript_draft(
    session_id: uuid.UUID,
    draft_id: uuid.UUID,
    learner_id: Annotated[uuid.UUID, Depends(get_learner_id)],
    db: Annotated[OrmSession, Depends(get_db)],
) -> TranscriptDraftView:
    try:
        return TranscriptService(db).discard(session_id, learner_id, draft_id)
    except TranscriptForbidden as exc:
        raise HTTPException(status_code=403, detail="不是你的 transcript draft") from exc
    except TranscriptNotFound as exc:
        raise HTTPException(status_code=404, detail="找不到 transcript draft") from exc

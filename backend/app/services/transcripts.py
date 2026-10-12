import uuid

from sqlalchemy.orm import Session as OrmSession

from app.api.transcript_schemas import TranscriptDraftCreate, TranscriptDraftView
from app.interaction_models import TranscriptDraft
from app.repositories.transcript_repository import TranscriptRepository


class TranscriptService:
    def __init__(self, db: OrmSession) -> None:
        self._db = db
        self._repo = TranscriptRepository(db)

    @staticmethod
    def _view(row: TranscriptDraft) -> TranscriptDraftView:
        return TranscriptDraftView(
            id=row.id,
            session_id=row.session_id,
            text=row.text,
            adapter=row.adapter,
            locale=row.locale,
            confidence=row.confidence,
            status=row.status,
            created_at=row.created_at,
            confirmed_at=row.confirmed_at,
            discarded_at=row.discarded_at,
        )

    def create(
        self,
        session_id: uuid.UUID,
        learner_id: uuid.UUID,
        payload: TranscriptDraftCreate,
    ) -> TranscriptDraftView:
        row = self._repo.create(
            session_id,
            learner_id,
            text=payload.text,
            adapter=payload.adapter,
            locale=payload.locale,
            confidence=payload.confidence,
        )
        self._db.commit()
        return self._view(row)

    def confirm(
        self,
        session_id: uuid.UUID,
        learner_id: uuid.UUID,
        draft_id: uuid.UUID,
    ) -> TranscriptDraftView:
        row = self._repo.confirm(self._repo.get(draft_id, session_id, learner_id))
        self._db.commit()
        return self._view(row)

    def discard(
        self,
        session_id: uuid.UUID,
        learner_id: uuid.UUID,
        draft_id: uuid.UUID,
    ) -> TranscriptDraftView:
        row = self._repo.discard(self._repo.get(draft_id, session_id, learner_id))
        self._db.commit()
        return self._view(row)

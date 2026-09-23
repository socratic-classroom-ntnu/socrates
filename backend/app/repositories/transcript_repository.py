import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session as OrmSession

from app.interaction_models import InteractionEvent, TranscriptDraft
from app.models import Session


class TranscriptNotFound(RuntimeError):
    pass


class TranscriptForbidden(RuntimeError):
    pass


class TranscriptRepository:
    def __init__(self, db: OrmSession) -> None:
        self._db = db

    def require_session(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> Session:
        session = self._db.get(Session, session_id)
        if session is None:
            raise TranscriptNotFound(str(session_id))
        if session.learner_id != learner_id:
            raise TranscriptForbidden(str(session_id))
        return session

    def create(
        self,
        session_id: uuid.UUID,
        learner_id: uuid.UUID,
        *,
        text: str,
        adapter: str,
        locale: str,
        confidence: float | None,
    ) -> TranscriptDraft:
        self.require_session(session_id, learner_id)
        draft = TranscriptDraft(
            id=uuid.uuid4(),
            session_id=session_id,
            learner_id=learner_id,
            text=text,
            adapter=adapter,
            locale=locale,
            confidence=confidence,
            status="draft",
        )
        self._db.add(draft)
        self.record_event(session_id, learner_id, "transcript_ready", {"draft_id": str(draft.id)})
        self._db.flush()
        return draft

    def get(
        self, draft_id: uuid.UUID, session_id: uuid.UUID, learner_id: uuid.UUID
    ) -> TranscriptDraft:
        draft = self._db.get(TranscriptDraft, draft_id)
        if draft is None or draft.session_id != session_id:
            raise TranscriptNotFound(str(draft_id))
        if draft.learner_id != learner_id:
            raise TranscriptForbidden(str(draft_id))
        return draft

    def confirm(self, draft: TranscriptDraft) -> TranscriptDraft:
        if draft.status == "draft":
            draft.status = "confirmed"
            draft.confirmed_at = datetime.now(timezone.utc)
            self.record_event(
                draft.session_id,
                draft.learner_id,
                "transcript_confirmed",
                {"draft_id": str(draft.id)},
            )
        return draft

    def discard(self, draft: TranscriptDraft) -> TranscriptDraft:
        if draft.status == "draft":
            draft.status = "discarded"
            draft.discarded_at = datetime.now(timezone.utc)
            self.record_event(
                draft.session_id,
                draft.learner_id,
                "transcript_discarded",
                {"draft_id": str(draft.id)},
            )
        return draft

    def record_event(
        self,
        session_id: uuid.UUID,
        learner_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        self._db.add(
            InteractionEvent(
                id=uuid.uuid4(),
                session_id=session_id,
                learner_id=learner_id,
                event_type=event_type,
                payload=payload,
            )
        )

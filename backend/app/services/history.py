import uuid

from sqlalchemy.orm import Session as OrmSession

from app.api.history_schemas import SessionHistoryItem, SessionHistoryPage
from app.ladders.repository import LadderRepository
from app.repositories.history_repository import HistoryRepository


class HistoryService:
    def __init__(self, db: OrmSession, ladder: LadderRepository) -> None:
        self._repo = HistoryRepository(db)
        self._ladder = ladder

    def list_sessions(
        self,
        learner_id: uuid.UUID,
        *,
        limit: int,
        cursor: str | None,
    ) -> SessionHistoryPage:
        rows, next_cursor = self._repo.list_for_learner(
            learner_id,
            limit=limit,
            cursor=cursor,
        )
        items: list[SessionHistoryItem] = []
        for row in rows:
            session = row.session
            last_message = session.messages[-1] if session.messages else None
            updated_at = session.ended_at or (
                last_message.created_at if last_message else session.started_at
            )
            title = None
            if 0 <= session.current_stage_index < self._ladder.total_stages:
                title = self._ladder.stage(session.current_stage_index).title
            items.append(
                SessionHistoryItem(
                    id=session.id,
                    status=session.status,
                    flow_state=session.flow_state,
                    current_stage_index=session.current_stage_index,
                    total_stages=self._ladder.total_stages,
                    started_at=session.started_at,
                    updated_at=updated_at,
                    ended_at=session.ended_at,
                    end_reason=session.end_reason,
                    summary_preview=(row.summary.core_principle[:160] if row.summary else None),
                    stage_title=title,
                )
            )
        return SessionHistoryPage(items=items, next_cursor=next_cursor)

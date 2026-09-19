import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from app.domain.session_state import OutgoingMessage, SessionState, StageState
from app.domain.types import EndReason
from app.models import Learner, Message, Session, StageProgress


class SessionRepository:
    def __init__(self, db: OrmSession) -> None:
        self._db = db

    def ensure_learner(self, learner_id: uuid.UUID) -> None:
        if self._db.get(Learner, learner_id) is None:
            self._db.add(Learner(id=learner_id))
            self._db.flush()

    def create(
        self, learner_id: uuid.UUID, ladder_id: str, ladder_version: int, state: SessionState
    ) -> Session:
        session = Session(
            id=uuid.uuid4(),
            learner_id=learner_id,
            ladder_id=ladder_id,
            ladder_version=ladder_version,
            status="active",
            flow_state=state.flow_state,
            current_stage_index=state.current_stage_index,
            extra_turns_used=state.extra_turns_used,
        )
        self._db.add(session)
        self._db.flush()
        for stage in state.stages:
            self._db.add(
                StageProgress(
                    session_id=session.id,
                    stage_index=stage.index,
                    stage_key=stage.key,
                    status=stage.status,
                    turn_count=stage.turn_count,
                    principle_label=stage.principle_label,
                    position_shifted=stage.position_shifted,
                )
            )
        self._db.flush()
        return session

    def get(self, session_id: uuid.UUID) -> Session | None:
        return self._db.get(Session, session_id)

    def get_for_update(self, session_id: uuid.UUID) -> Session | None:
        """同一 session 的並發請求以列鎖序列化——學生連點兩下不會產生兩條分岔的對話。"""
        stmt = (
            select(Session)
            .where(Session.id == session_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        session = self._db.execute(stmt).scalar_one_or_none()
        if session is not None:
            self._db.expire(session, ["messages", "stage_progress"])
        return session

    def next_seq(self, session_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(Message.seq), -1) + 1).where(
            Message.session_id == session_id
        )
        return int(self._db.scalar(stmt))

    def append_messages(self, session: Session, messages: tuple[OutgoingMessage, ...]) -> None:
        seq = self.next_seq(session.id)
        for index, message in enumerate(messages):
            self._db.add(
                Message(
                    session_id=session.id,
                    seq=seq + index,
                    stage_index=message.stage_index,
                    role=message.role,
                    content=message.content,
                    observations=(
                        message.observations.model_dump() if message.observations else None
                    ),
                )
            )
        self._db.flush()
        # 同一請求後續會用 session.messages 組 provider history；不可沿用舊集合。
        self._db.expire(session, ["messages"])

    def save_state(
        self, session: Session, state: SessionState, end_reason: EndReason | None = None
    ) -> None:
        session.flow_state = state.flow_state
        session.current_stage_index = state.current_stage_index
        session.extra_turns_used = state.extra_turns_used
        if state.flow_state == "ended" and session.status != "ended":
            if end_reason is None:
                raise ValueError("結束 session 時必須提供 end_reason")
            session.status = "ended"
            session.ended_at = datetime.now(timezone.utc)
            session.end_reason = end_reason
        by_index = {s.index: s for s in state.stages}
        for row in session.stage_progress:
            stage = by_index[row.stage_index]
            row.status = stage.status
            row.turn_count = stage.turn_count
            row.principle_label = stage.principle_label
            row.position_shifted = stage.position_shifted
        self._db.flush()

    @staticmethod
    def to_state(session: Session) -> SessionState:
        return SessionState(
            flow_state=session.flow_state,
            current_stage_index=session.current_stage_index,
            extra_turns_used=session.extra_turns_used,
            stages=tuple(
                StageState(
                    index=row.stage_index,
                    key=row.stage_key,
                    status=row.status,
                    turn_count=row.turn_count,
                    principle_label=row.principle_label,
                    position_shifted=row.position_shifted,
                )
                for row in session.stage_progress
            ),
        )

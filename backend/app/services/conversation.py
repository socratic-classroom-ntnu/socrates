import uuid

from sqlalchemy.orm import Session as OrmSession

from app.api.schemas import (
    MessageView,
    SessionDetail,
    SessionInfo,
    SessionView,
    StageView,
    StageOutcomeView,
    SummaryView,
)
from app.domain.session_state import SessionState, actions_for
from app.domain.tutor import PromptMessage, SummaryDraft
from app.domain.types import Action
from app.ladders.repository import LadderRepository
from app.models import Session, Summary
from app.orchestrator.orchestrator import ConversationEnded, InvalidAction, Orchestrator
from app.repositories.session_repository import SessionRepository
from app.tutor.gateway import TutorGateway, TutorUnavailable


MAX_MESSAGES_PER_SESSION = 200
MAX_RETRIES_PER_PENDING_MESSAGE = 3


class Forbidden(RuntimeError):
    pass


class NotFound(RuntimeError):
    pass


class ActiveSessionExists(RuntimeError):
    def __init__(self, session_id: uuid.UUID) -> None:
        self.session_id = session_id
        super().__init__(str(session_id))


class RetryLimitReached(RuntimeError):
    pass


def _provider_history(session: Session) -> list[PromptMessage]:
    """送進 provider 的對話歷史只含師生發言。

    `system`（路口提示）是給畫面看的，不是對話的一部分——把它送進去會讓
    模型以為那是教授說過的話。用明確的 if 收斂而不是 `in (...)`，
    是為了讓型別檢查真的擋得住多送一種角色進來。
    """
    history: list[PromptMessage] = []
    for message in session.messages:
        if message.role == "student" or message.role == "tutor":
            history.append(PromptMessage(role=message.role, content=message.content))
    return history


class ConversationService:
    def __init__(self, db: OrmSession, ladder: LadderRepository, gateway: TutorGateway) -> None:
        self._db = db
        self._ladder = ladder
        self._repo = SessionRepository(db)
        self._gateway = gateway
        self._orchestrator = Orchestrator(ladder, gateway)

    def start(self, learner_id: uuid.UUID, restart_existing: bool = False) -> SessionView:
        try:
            self._repo.lock_learner(learner_id)
            previous = self._repo.get_active_for_learner(learner_id)
            if previous is not None and not restart_existing:
                raise ActiveSessionExists(previous.id)
            if previous is not None:
                closed = self._orchestrator.handle_end(SessionRepository.to_state(previous))
                self._repo.save_state(previous, closed.state, end_reason="restarted")

            outcome = self._orchestrator.start()
            ladder = self._ladder.get()
            session = self._repo.create(learner_id, ladder.id, ladder.version, outcome.state)
            self._repo.append_messages(session, outcome.appended)
            response = self.view(session, outcome.state, appended_count=len(outcome.appended))
            self._db.commit()
            return response
        except Exception:
            self._db.rollback()
            raise

    def detail(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> SessionDetail:
        session = self._load(session_id, learner_id)
        state = SessionRepository.to_state(session)
        return SessionDetail(
            session=self._info(session, state),
            stage=self._stage(state),
            messages=[
                MessageView(seq=m.seq, role=m.role, content=m.content) for m in session.messages
            ],
            available_actions=self._actions(session, state),
            summary=self._summary(session, state),
        )

    def view(self, session: Session, state: SessionState, appended_count: int) -> SessionView:
        appended = (
            session.messages[len(session.messages) - appended_count :] if appended_count else []
        )
        return SessionView(
            session=self._info(session, state),
            stage=self._stage(state),
            appended_messages=[
                MessageView(seq=m.seq, role=m.role, content=m.content) for m in appended
            ],
            available_actions=self._actions(session, state),
            summary=self._summary(session, state),
        )

    def _actions(self, session: Session, state: SessionState) -> list[Action]:
        pending = bool(session.messages and session.messages[-1].role == "student")
        allowed = not pending or (
            session.messages[-1].retry_count < MAX_RETRIES_PER_PENDING_MESSAGE
        )
        return list(actions_for(state.flow_state, pending_reply=pending, retry_allowed=allowed))

    def _load(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> Session:
        session = self._repo.get(session_id)
        if session is None:
            raise NotFound(str(session_id))
        if session.learner_id != learner_id:
            raise Forbidden(str(session_id))
        return session

    def _info(self, session: Session, state: SessionState) -> SessionInfo:
        updated_at = (
            session.messages[-1].created_at
            if session.messages
            else (session.ended_at or session.started_at)
        )
        return SessionInfo(
            id=session.id,
            status=session.status,
            flow_state=state.flow_state,
            current_stage_index=state.current_stage_index,
            total_stages=self._ladder.total_stages,
            end_reason=session.end_reason,
            started_at=session.started_at,
            ended_at=session.ended_at,
            updated_at=updated_at,
        )

    def _stage(self, state: SessionState) -> StageView | None:
        """只回傳學生已經進入的那一階。未進入的階連 title 都不外流（§4.1）。"""
        if state.flow_state == "ended":
            return None
        current = state.stages[state.current_stage_index]
        if current.status == "not_started":
            return None
        stage = self._ladder.stage(current.index)
        return StageView(
            index=current.index,
            key=stage.key,
            title=stage.title,
            opening_statement=stage.opening_statement,
        )

    def _summary(self, session: Session, state: SessionState) -> SummaryView | None:
        row = self._db.get(Summary, session.id)
        return None if row is None else self._summary_view(session, row)

    def send_message(self, session_id: uuid.UUID, learner_id: uuid.UUID, text: str) -> SessionView:
        session = self._lock(session_id, learner_id)
        if len(session.messages) >= MAX_MESSAGES_PER_SESSION:
            raise ConversationEnded("這段討論的訊息數已達上限")
        if session.messages and session.messages[-1].role == "student":
            raise InvalidAction("上一則發言尚未得到回覆，請先重試")
        state = SessionRepository.to_state(session)

        # 1. 學生訊息先落地並 commit —— 設計規格 §10，順序不可調換
        student_seq = self._repo.next_seq(session.id)
        student = self._orchestrator.accept_student_message(state, text)
        self._repo.append_messages(session, (student,))
        self._db.commit()

        # 2. 才呼叫 provider。這一步失敗時，上面那則訊息已經安全了
        return self._run_turn(
            session_id, learner_id, appended_count=2, expected_student_seq=student_seq
        )

    def retry(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> SessionView:
        """只在最後一則學生發言尚無教授回覆時重試。"""
        return self._run_turn(session_id, learner_id, appended_count=1)

    def _run_turn(
        self,
        session_id: uuid.UUID,
        learner_id: uuid.UUID,
        appended_count: int,
        expected_student_seq: int | None = None,
    ) -> SessionView:
        # 學生發言已在上一個 transaction 提交；此處重新取得列鎖，
        # 並持有到 provider 回覆與狀態寫入完成，避免同一輪產生兩則教授回覆。
        session = self._lock(session_id, learner_id)
        if expected_student_seq is not None:
            last_seq = session.messages[-1].seq
            if last_seq == expected_student_seq + 1 and session.messages[-1].role == "tutor":
                # 同輪 retry 搶先完成；可回傳它剛寫好的學生與教授兩則。
                return self.view(session, SessionRepository.to_state(session), appended_count=2)
            if last_seq != expected_student_seq:
                # 其他請求已推進到下一輪；原 send 不得拿下一輪的學生發言再呼叫 provider。
                raise InvalidAction("對話狀態已更新，請重新載入")
        if session.status == "ended":
            raise ConversationEnded("這段討論已經結束了")
        if not session.messages or session.messages[-1].role != "student":
            raise InvalidAction("沒有待重試的學生發言")
        state = SessionRepository.to_state(session)
        history = _provider_history(session)
        is_retry = expected_student_seq is None
        if is_retry:
            pending = session.messages[-1]
            if pending.retry_count >= MAX_RETRIES_PER_PENDING_MESSAGE:
                self._db.rollback()
                raise RetryLimitReached("重試次數已用完")
            pending.retry_count += 1
            self._db.flush()
        try:
            outcome = self._orchestrator.advance_turn(state, history)
        except TutorUnavailable:
            if is_retry:
                self._db.commit()  # 保留本次 retry 計數；原學生訊息早已落地。
            else:
                self._db.rollback()  # 釋放列鎖；先前 commit 的學生發言仍在。
            raise
        self._repo.append_messages(session, outcome.appended)
        self._repo.save_state(
            session,
            outcome.state,
            end_reason="completed" if outcome.state.flow_state == "ended" else None,
        )
        # Materialize the response before commit releases the row lock. A later
        # request may otherwise change the session or message tail before we read it.
        response = self.view(session, outcome.state, appended_count=appended_count)
        self._db.commit()
        return response

    def _lock(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> Session:
        session = self._repo.get_for_update(session_id)
        if session is None:
            raise NotFound(str(session_id))
        if session.learner_id != learner_id:
            raise Forbidden(str(session_id))
        return session

    def advance(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> SessionView:
        session = self._lock(session_id, learner_id)
        outcome = self._orchestrator.handle_advance(SessionRepository.to_state(session))
        self._repo.append_messages(session, outcome.appended)
        self._repo.save_state(session, outcome.state)
        response = self.view(session, outcome.state, appended_count=len(outcome.appended))
        self._db.commit()
        return response

    def end(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> SessionView:
        session = self._lock(session_id, learner_id)
        outcome = self._orchestrator.handle_end(SessionRepository.to_state(session))
        self._repo.save_state(session, outcome.state, end_reason="student_ended")
        # Materialize the response before commit releases the row lock. A later
        # request may otherwise change the session or message tail before we read it.
        response = self.view(session, outcome.state, appended_count=0)
        self._db.commit()
        return response

    def generate_summary(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> SummaryView:
        session = self._lock(session_id, learner_id)
        if session.status != "ended":
            raise InvalidAction("討論尚未結束，不能產生總結")
        existing = self._db.get(Summary, session.id)
        if existing is not None:
            return self._summary_view(session, existing)

        has_student_message = any(m.role == "student" for m in session.messages)
        history = _provider_history(session)
        # 無發言時只存固定的中性佔位內容，不呼叫 provider 猜測學生立場。
        draft = (
            self._gateway.summarize(history)
            if has_student_message
            else SummaryDraft(
                core_principle="尚未提出立場", tension="", stance_by_stage=[], shifted=False
            )
        )
        row = Summary(
            session_id=session.id,
            core_principle=draft.core_principle,
            tension=draft.tension,
            stance_by_stage=[s.model_dump() for s in draft.stance_by_stage],
            shifted=draft.shifted,
            raw=draft.model_dump(),
        )
        self._db.add(row)
        self._db.commit()
        return self._summary_view(session, row)

    def get_summary(self, session_id: uuid.UUID, learner_id: uuid.UUID) -> SummaryView:
        session = self._load(session_id, learner_id)
        row = self._db.get(Summary, session.id)
        if row is None:
            raise NotFound("summary")
        return self._summary_view(session, row)

    def _summary_view(self, session: Session, row: Summary) -> SummaryView:
        state = SessionRepository.to_state(session)
        points: list[str] = []
        for item in row.stance_by_stage:
            if not isinstance(item, dict):
                continue
            value = item.get("principle_label") or item.get("principle") or item.get("stance")
            if value and str(value) not in points:
                points.append(str(value))
        if not points:
            points = [row.core_principle]
        student_lines = [
            message.content.strip()
            for message in session.messages
            if message.role == "student" and message.content.strip()
        ]
        return SummaryView(
            discussion_topic="電車難題：選擇、責任與原則",
            core_principle=row.core_principle,
            key_points=points[:4],
            tension=row.tension,
            reflection_excerpt=("；".join(student_lines[-3:]) if student_lines else None),
            stage_outcomes=[
                StageOutcomeView(
                    index=stage.index,
                    status=stage.status,
                    title=(
                        None
                        if stage.status in ("skipped", "not_started")
                        else self._ladder.stage(stage.index).title
                    ),
                )
                for stage in state.stages
            ],
        )

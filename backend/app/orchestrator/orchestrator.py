from dataclasses import replace

from app.domain.session_state import (
    Outcome,
    OutgoingMessage,
    SessionState,
    StageState,
)
from app.domain.tutor import PromptMessage
from app.domain.types import FlowState
from app.ladders.repository import LadderRepository
from app.orchestrator.policy import should_advance
from app.tutor.gateway import TutorGateway


class ConversationEnded(RuntimeError):
    """session 已結束，不接受任何動作（設計規格 §8）。"""


class InvalidAction(RuntimeError):
    """目前的 flow_state 不允許這個動作。"""


class Orchestrator:
    """系統裡唯一知道「這堂課該怎麼走」的地方。

    它決定推進，不決定文字——文字向 TutorGateway 要。
    **不得 import 任何 LLM 相關模組**（設計規格 §5.1）。
    """

    def __init__(self, ladder: LadderRepository, gateway: TutorGateway) -> None:
        self._ladder = ladder
        self._gateway = gateway

    def start(self) -> Outcome:
        stage = self._ladder.stage(0)
        stages = tuple(
            StageState(
                index=i,
                key=self._ladder.stage(i).key,
                status="in_progress" if i == 0 else "not_started",
                turn_count=0,
                principle_label="未明",
                position_shifted=False,
            )
            for i in range(self._ladder.total_stages)
        )
        state = SessionState(flow_state="active_in_stage", current_stage_index=0, stages=stages)
        opening = OutgoingMessage(role="tutor", content=stage.opening_statement, stage_index=0)
        return Outcome(state=state, appended=(opening,))

    def accept_student_message(self, state: SessionState, text: str) -> OutgoingMessage:
        """純邏輯，**不碰 provider**。

        設計規格 §10：學生打了一大段對電車難題的思考，結果模型超時、整段消失——
        這是這個產品最不能發生的事。把「接受發言」與「推進一輪」分開，
        service 才能先落地再呼叫模型。
        """
        self._guard_can_speak(state)
        return OutgoingMessage(role="student", content=text, stage_index=state.current_stage_index)

    def advance_turn(self, state: SessionState, history: list[PromptMessage]) -> Outcome:
        """呼叫 gateway 取得教授的回應並裁決推進。history 需已包含學生的最新發言。"""
        self._guard_can_speak(state)

        index = state.current_stage_index
        stage_state = state.stages[index]
        stage = self._ladder.stage(index)

        turn = self._gateway.respond(stage, history, turn_index=stage_state.turn_count)
        tutor = OutgoingMessage(
            role="tutor",
            content=turn.reply_text,
            stage_index=index,
            observations=turn.observations,
        )

        updated = replace(
            stage_state,
            turn_count=stage_state.turn_count + 1,
            principle_label=turn.observations.principle_label,
            position_shifted=stage_state.position_shifted or turn.observations.position_shifted,
        )
        flow = state.flow_state
        extra_used = state.extra_turns_used

        if state.flow_state == "awaiting_wrap_up":
            extra_used += 1
            if extra_used >= self._ladder.get().extra_turns_cap:
                stages = tuple(updated if s.index == index else s for s in state.stages)
                return Outcome(
                    state=replace(
                        state, flow_state="ended", stages=stages, extra_turns_used=extra_used
                    ),
                    appended=(tutor,),
                )
        elif should_advance(turn.observations, stage_state.turn_count):
            updated = replace(updated, status="goal_met")
            flow = self._after_stage_completed(index)
        elif updated.turn_count >= stage.max_turns:
            updated = replace(updated, status="capped")
            flow = self._after_stage_completed(index)

        stages = tuple(updated if s.index == index else s for s in state.stages)
        return Outcome(
            state=replace(state, flow_state=flow, stages=stages, extra_turns_used=extra_used),
            appended=(tutor,),
        )

    def handle_advance(self, state: SessionState) -> Outcome:
        if state.flow_state == "ended":
            raise ConversationEnded("這段討論已經結束了")
        if state.flow_state != "at_crossroad":
            raise InvalidAction("目前不在情境路口")
        next_index = state.current_stage_index + 1
        if next_index >= self._ladder.total_stages:
            raise InvalidAction("沒有下一個情境")

        stage = self._ladder.stage(next_index)
        stages = tuple(
            replace(item, status="in_progress") if item.index == next_index else item
            for item in state.stages
        )
        return Outcome(
            state=replace(
                state,
                flow_state="active_in_stage",
                current_stage_index=next_index,
                stages=stages,
            ),
            appended=(
                OutgoingMessage(
                    role="tutor", content=stage.opening_statement, stage_index=next_index
                ),
            ),
        )

    def _after_stage_completed(self, index: int) -> FlowState:
        has_next = index + 1 < self._ladder.total_stages
        return "at_crossroad" if has_next else "awaiting_wrap_up"

    def handle_end(self, state: SessionState) -> Outcome:
        """「結束討論」從任何未結束狀態皆可觸發，不經過模型（設計規格 §8）。"""
        if state.flow_state == "ended":
            raise ConversationEnded("這段討論已經結束了")

        stages = tuple(self._close(stage) for stage in state.stages)
        return Outcome(state=replace(state, flow_state="ended", stages=stages), appended=())

    def _guard_can_speak(self, state: SessionState) -> None:
        if state.flow_state == "ended":
            raise ConversationEnded("這段討論已經結束了")
        if state.flow_state not in ("active_in_stage", "awaiting_wrap_up"):
            raise InvalidAction(f"{state.flow_state} 不接受發言")

    @staticmethod
    def _close(stage: StageState) -> StageState:
        if stage.status == "in_progress":
            return replace(stage, status="stopped_early")
        if stage.status == "not_started":
            return replace(stage, status="skipped")
        return stage

from dataclasses import dataclass

from app.domain.tutor import Observations
from app.domain.types import Action, FlowState, MessageRole, PrincipleLabel, StageStatus


@dataclass(frozen=True)
class StageState:
    index: int
    key: str
    status: StageStatus
    turn_count: int
    principle_label: PrincipleLabel
    position_shifted: bool


@dataclass(frozen=True)
class SessionState:
    flow_state: FlowState
    current_stage_index: int
    stages: tuple[StageState, ...]
    extra_turns_used: int = 0


@dataclass(frozen=True)
class OutgoingMessage:
    role: MessageRole
    content: str
    stage_index: int
    observations: Observations | None = None


@dataclass(frozen=True)
class Outcome:
    state: SessionState
    appended: tuple[OutgoingMessage, ...]


_ACTIONS: dict[FlowState, tuple[Action, ...]] = {
    "active_in_stage": ("send_message", "end"),
    "at_crossroad": ("advance", "end"),
    "awaiting_wrap_up": ("send_message", "end"),
    "ended": (),
}


def actions_for(flow_state: FlowState, pending_reply: bool = False) -> tuple[Action, ...]:
    """設計規格 §9.1：可用動作由後端決定，前端不自行推導。

    「結束討論」在所有未結束狀態皆可用——與 §8 的狀態機一致。
    """
    if pending_reply and flow_state in ("active_in_stage", "awaiting_wrap_up"):
        return ("retry", "end")
    return _ACTIONS[flow_state]

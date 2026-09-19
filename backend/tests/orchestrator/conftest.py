import pytest

from app.domain.ladder import Ladder, Stage
from app.domain.tutor import Observations, PromptMessage, TutorTurn
from app.ladders.repository import LadderRepository


def make_ladder(stage_count: int = 1, max_turns: int = 4) -> LadderRepository:
    stages = [
        Stage(
            key=f"s{i}",
            title=f"情境 {i}",
            opening_statement=f"這是第 {i} 個情境的原文。\n",
            teaching_goal="測試用",
            probe_hints=[],
            max_turns=max_turns,
        )
        for i in range(stage_count)
    ]
    return LadderRepository(
        Ladder(id="fixture", version=1, title="測試", stages=stages, extra_turns_cap=2)
    )


def obs(
    has_position: bool = True,
    has_reason: bool = True,
    reason_tested: bool = True,
    shifted: bool = False,
    label: str = "後果主義",
) -> Observations:
    return Observations(
        has_position=has_position,
        has_reason=has_reason,
        reason_tested=reason_tested,
        principle_label=label,
        position_shifted=shifted,
    )


class FakeGateway:
    """直接餵 observations，不經過任何模型。

    Orchestrator 的測試因此是毫秒級的純邏輯測試（設計規格 §13.2 第一層）。
    """

    def __init__(self, turns: list[Observations]) -> None:
        self._turns = turns
        self.calls = 0

    def respond(self, stage, history, turn_index: int) -> TutorTurn:
        observations = self._turns[min(self.calls, len(self._turns) - 1)]
        self.calls += 1
        return TutorTurn(reply_text=f"回應 {self.calls}", observations=observations)


def speak(orch, state, text: str):
    """模擬一次完整的來回：接受發言 → 推進一輪。

    對應 service 層的實際順序（學生訊息先落地，再呼叫 provider）。
    """
    student = orch.accept_student_message(state, text)
    outcome = orch.advance_turn(state, [PromptMessage(role="student", content=text)])
    return student, outcome


@pytest.fixture
def ladder():
    return make_ladder()

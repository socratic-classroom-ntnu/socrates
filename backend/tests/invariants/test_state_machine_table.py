import pytest

from app.orchestrator.orchestrator import ConversationEnded, Orchestrator
from tests.orchestrator.conftest import FakeGateway, make_ladder, obs, speak

XFAIL_LINE_A = pytest.mark.xfail(strict=True, reason="線 A 實作：路口與硬上限")


def test_ended_session_rejects_further_messages():
    """設計規格 §8：ended 之後任何動作一律拒絕。"""
    orch = Orchestrator(make_ladder(), FakeGateway([obs()]))
    ended = orch.handle_end(orch.start().state).state
    with pytest.raises(ConversationEnded):
        orch.accept_student_message(ended, "還想再說")


def test_ended_session_rejects_further_ends():
    orch = Orchestrator(make_ladder(), FakeGateway([obs()]))
    ended = orch.handle_end(orch.start().state).state
    with pytest.raises(ConversationEnded):
        orch.handle_end(ended)


@XFAIL_LINE_A
def test_advance_enters_next_stage_and_emits_opening_verbatim():
    ladder = make_ladder(stage_count=2)
    orch = Orchestrator(ladder, FakeGateway([obs(reason_tested=False), obs()]))
    _, first = speak(orch, orch.start().state, "我會轉向")
    _, completed = speak(orch, first.state, "因為人數")
    assert completed.state.flow_state == "at_crossroad"
    outcome = orch.handle_advance(completed.state)
    assert outcome.state.current_stage_index == 1
    assert outcome.state.stages[1].status == "in_progress"
    assert outcome.appended[0].content == ladder.stage(1).opening_statement


@XFAIL_LINE_A
def test_turn_limit_marks_capped_not_goal_met():
    """設計規格 §4.5：問到上限仍未達成，不得假裝達成。
    照見包含照見自己的模糊。"""
    gateway = FakeGateway([obs(reason_tested=False)])
    orch = Orchestrator(make_ladder(stage_count=2, max_turns=2), gateway)
    _, first = speak(orch, orch.start().state, "一")
    _, second = speak(orch, first.state, "二")
    assert second.state.stages[0].status == "capped"
    assert second.state.flow_state == "at_crossroad"


@XFAIL_LINE_A
def test_turn_limit_wins_when_position_shifts_on_same_turn():
    """Fizzy 已確認：立場改變與硬上限同輪發生時，以上限優先。"""
    gateway = FakeGateway(
        [
            obs(reason_tested=False),
            obs(reason_tested=True, shifted=True),
        ]
    )
    orch = Orchestrator(make_ladder(stage_count=2, max_turns=2), gateway)
    _, first = speak(orch, orch.start().state, "一")
    _, second = speak(orch, first.state, "二")
    assert second.state.stages[0].status == "capped"
    assert second.state.stages[0].position_shifted is True
    assert second.state.flow_state == "at_crossroad"

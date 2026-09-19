import pytest

from app.orchestrator.orchestrator import ConversationEnded, Orchestrator
from tests.orchestrator.conftest import FakeGateway, make_ladder, obs, speak


def test_end_from_in_progress_marks_stopped_early():
    """設計規格 §4.6：已進入但未達成也未到上限時主動結束 → stopped_early。
    與「根本沒走到」的 skipped 意義完全不同。"""
    orch = Orchestrator(make_ladder(stage_count=2), FakeGateway([obs()]))
    state = orch.start().state
    outcome = orch.handle_end(state)
    assert outcome.state.flow_state == "ended"
    assert outcome.state.stages[0].status == "stopped_early"
    assert outcome.state.stages[1].status == "skipped"


def test_end_preserves_already_completed_stages():
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    orch = Orchestrator(make_ladder(), gateway)
    _, first = speak(orch, orch.start().state, "我會轉向")
    _, outcome = speak(orch, first.state, "因為人數")
    assert outcome.state.stages[0].status == "goal_met"
    ended = orch.handle_end(outcome.state)
    assert ended.state.stages[0].status == "goal_met"


def test_student_may_keep_talking_after_wrap_up_is_proposed():
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    orch = Orchestrator(make_ladder(max_turns=9), gateway)
    _, first = speak(orch, orch.start().state, "我會轉向")
    _, completed = speak(orch, first.state, "因為人數")
    assert completed.state.flow_state == "awaiting_wrap_up"
    _, extra = speak(orch, completed.state, "再補一句")
    assert extra.state.flow_state == "awaiting_wrap_up"
    assert extra.state.extra_turns_used == 1


def test_extra_turns_are_capped():
    """追加輪有上限，避免收尾後無限延長。fixture 的 extra_turns_cap = 2。"""
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    orch = Orchestrator(make_ladder(max_turns=9), gateway)
    _, first = speak(orch, orch.start().state, "我會轉向")
    _, completed = speak(orch, first.state, "因為人數")
    _, extra_one = speak(orch, completed.state, "補充一")
    _, extra_two = speak(orch, extra_one.state, "補充二")
    assert extra_two.state.flow_state == "ended"

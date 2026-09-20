import pytest

from app.orchestrator.orchestrator import ConversationEnded, InvalidAction, Orchestrator
from tests.orchestrator.conftest import FakeGateway, make_ladder, obs, speak


def test_advance_enters_next_stage_with_verbatim_opening():
    ladder = make_ladder(stage_count=2)
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    orch = Orchestrator(ladder, gateway)
    _, first = speak(orch, orch.start().state, "選擇")
    _, crossroad = speak(orch, first.state, "理由")
    entered = orch.handle_advance(crossroad.state)
    assert entered.state.current_stage_index == 1
    assert entered.state.flow_state == "active_in_stage"
    assert entered.state.stages[1].status == "in_progress"
    assert [(m.role, m.content, m.stage_index) for m in entered.appended] == [
        ("tutor", ladder.stage(1).opening_statement, 1)
    ]
    assert gateway.calls == 2


def test_advance_before_crossroad_is_rejected():
    orch = Orchestrator(make_ladder(stage_count=2), FakeGateway([obs()]))
    with pytest.raises(InvalidAction):
        orch.handle_advance(orch.start().state)


def test_advance_after_end_is_rejected():
    orch = Orchestrator(make_ladder(stage_count=2), FakeGateway([obs()]))
    ended = orch.handle_end(orch.start().state).state
    with pytest.raises(ConversationEnded):
        orch.handle_advance(ended)

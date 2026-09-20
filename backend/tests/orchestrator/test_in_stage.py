from app.domain.session_state import actions_for
from app.orchestrator.orchestrator import Orchestrator
from tests.orchestrator.conftest import FakeGateway, make_ladder, obs, speak


def test_start_opens_first_stage():
    orch = Orchestrator(make_ladder(), FakeGateway([obs()]))
    outcome = orch.start()
    assert outcome.state.flow_state == "active_in_stage"
    assert outcome.state.current_stage_index == 0
    assert outcome.state.stages[0].status == "in_progress"
    assert len(outcome.appended) == 1
    assert outcome.appended[0].role == "tutor"


def test_accept_student_message_does_not_touch_the_provider():
    """設計規格 §10 的結構保證：接受發言這一步完全不碰 provider，
    因此 service 可以先落地再呼叫模型。"""
    gateway = FakeGateway([obs()])
    orch = Orchestrator(make_ladder(), gateway)
    state = orch.start().state
    message = orch.accept_student_message(state, "我會轉向")
    assert message.role == "student"
    assert message.content == "我會轉向"
    assert gateway.calls == 0


def test_first_turn_never_advances():
    # 即使 provider 在第一輪錯報 reason_tested=True，也不能一輪過關。
    gateway = FakeGateway([obs(reason_tested=True)])
    orch = Orchestrator(make_ladder(), gateway)
    state = orch.start().state
    _, outcome = speak(orch, state, "我會轉向")
    assert outcome.state.flow_state == "active_in_stage"
    assert outcome.state.stages[0].turn_count == 1
    assert [m.role for m in outcome.appended] == ["tutor"]


def test_records_observations_on_tutor_message():
    gateway = FakeGateway([obs(reason_tested=False, label="後果主義")])
    orch = Orchestrator(make_ladder(), gateway)
    state = orch.start().state
    _, outcome = speak(orch, state, "我會轉向")
    tutor_message = outcome.appended[0]
    assert tutor_message.observations is not None
    assert tutor_message.observations.principle_label == "後果主義"
    assert outcome.state.stages[0].principle_label == "後果主義"


def test_shifted_position_keeps_student_in_stage():
    """設計規格 §4.4：立場剛改變時不得推進，即使三條件齊備。"""
    gateway = FakeGateway([obs(shifted=True)])
    orch = Orchestrator(make_ladder(), gateway)
    state = orch.start().state
    _, outcome = speak(orch, state, "其實我改變想法了")
    assert outcome.state.flow_state == "active_in_stage"
    assert outcome.state.stages[0].status == "in_progress"


def test_three_conditions_complete_the_stage():
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    orch = Orchestrator(make_ladder(), gateway)
    state = orch.start().state
    _, first = speak(orch, state, "我會轉向")
    _, outcome = speak(orch, first.state, "因為五條命比一條多")
    assert outcome.state.stages[0].status == "goal_met"
    assert outcome.state.flow_state == "awaiting_wrap_up"


def test_completed_stage_moves_to_crossroad_when_more_stages_remain():
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    orch = Orchestrator(make_ladder(stage_count=2), gateway)
    state = orch.start().state
    _, first = speak(orch, state, "我會轉向")
    _, outcome = speak(orch, first.state, "因為五條命比一條多")
    assert outcome.state.flow_state == "at_crossroad"


def test_unmet_turn_limit_is_capped_and_opens_crossroad():
    orch = Orchestrator(
        make_ladder(stage_count=2, max_turns=2), FakeGateway([obs(reason_tested=False)])
    )
    _, first = speak(orch, orch.start().state, "第一輪")
    _, second = speak(orch, first.state, "第二輪")
    assert second.state.stages[0].status == "capped"
    assert second.state.flow_state == "at_crossroad"


def test_shift_on_last_allowed_turn_is_recorded_but_capped():
    gateway = FakeGateway([obs(reason_tested=False), obs(shifted=True)])
    orch = Orchestrator(make_ladder(stage_count=2, max_turns=2), gateway)
    _, first = speak(orch, orch.start().state, "原本的想法")
    _, second = speak(orch, first.state, "我改變想法")
    assert second.state.stages[0].status == "capped"
    assert second.state.stages[0].position_shifted is True
    assert second.state.flow_state == "at_crossroad"


def test_last_stage_limit_enters_wrap_up_without_claiming_goal_met():
    orch = Orchestrator(make_ladder(max_turns=2), FakeGateway([obs(reason_tested=False)]))
    _, first = speak(orch, orch.start().state, "第一輪")
    _, second = speak(orch, first.state, "第二輪")
    assert second.state.stages[0].status == "capped"
    assert second.state.flow_state == "awaiting_wrap_up"


def test_available_actions_are_decided_by_flow_state():
    assert actions_for("active_in_stage") == ("send_message", "end")
    assert actions_for("active_in_stage", pending_reply=True) == ("retry", "end")
    assert actions_for("at_crossroad") == ("advance", "end")
    assert actions_for("awaiting_wrap_up") == ("send_message", "end")
    assert actions_for("ended") == ()

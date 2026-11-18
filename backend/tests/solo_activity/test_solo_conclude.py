"""After a confirmation, ``policy.should_conclude`` decides: another scenario or the review.

The length of the scenario list never decides it; the list only says whether there is a scenario
to extend with. Floor and ceiling are read from ``policy.py`` so retuning does not break these.
"""

from app.modules.llm_runtime import policy
from app.modules.llm_runtime.policy import MAX_SCENARIOS, MIN_SCENARIOS
from app.modules.solo_activity import attempt_machine as sm
from tests.solo_activity.test_solo_state_table import T0, fresh, turn


def _reply(a: sm.AttemptState, **observed) -> sm.AttemptState:
    a, pending = sm.send_message(a, "回覆", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn(**observed))
    assert result is not None
    return result


def confirm_current(a: sm.AttemptState, shifted: bool = False) -> sm.AttemptState:
    """Answer the current scenario, talk until the summary is offered, and confirm it.

    ``shifted``: the student changes their position along the way, so this scenario's dialogue
    reported a shift before it was confirmed."""
    a, pending = sm.send_message(a, "回答", T0)
    a = sm.apply_tutor_turn(a, pending.key, turn())  # type: ignore[assignment]
    if shifted:
        a = _reply(a, position_shifted=True)
        a = _reply(a)  # the turn right after a shift is held back
    a = _reply(a)
    assert a.state == "confirming"
    return sm.confirm_viewpoint(a, a.current.summary_digest or "")


def walk(a: sm.AttemptState, shifts: list[bool]) -> sm.AttemptState:
    """Confirm one scenario per entry of ``shifts``, moving on whenever the machine allows."""
    for shifted in shifts:
        a = confirm_current(a, shifted)
        if a.state != "between_scenarios":
            break
        a = sm.next_scenario(a)
    return a


def test_below_the_floor_the_sequence_extends():
    a = walk(fresh(MAX_SCENARIOS), [False] * (MIN_SCENARIOS - 1))
    assert a.state == "answering"
    assert a.scenario_index == MIN_SCENARIOS - 1


def test_a_settled_view_at_the_floor_concludes_with_scenarios_left_over():
    a = walk(fresh(MAX_SCENARIOS), [False] * MIN_SCENARIOS)
    assert a.state == "reviewing"
    assert a.scenario_index == MIN_SCENARIOS - 1
    assert [p.status for p in a.progress].count("goal_met") == MIN_SCENARIOS
    assert all(p.answer is None for p in a.progress[MIN_SCENARIOS:])


def test_a_shift_in_the_latest_scenario_extends_once_more():
    a = confirm_current(walk(fresh(MAX_SCENARIOS), [False] * (MIN_SCENARIOS - 1)), shifted=True)
    assert a.state == "between_scenarios"


def test_an_earlier_shift_does_not_hold_the_conclusion():
    a = walk(fresh(MAX_SCENARIOS), [True] + [False] * (MIN_SCENARIOS - 1))
    assert a.state == "reviewing"


def test_the_ceiling_concludes_even_after_a_shift():
    a = confirm_current(walk(fresh(MAX_SCENARIOS + 1), [True] * (MAX_SCENARIOS - 1)), shifted=True)
    assert a.state == "reviewing"
    assert a.scenario_index == MAX_SCENARIOS - 1


def test_the_rule_wants_more_but_there_is_no_scenario_to_extend_with():
    # Until extended scenarios are produced the sequence is just the first one; the student is
    # sent to the review instead of waiting for a scenario that does not exist.
    a = confirm_current(fresh(1))
    assert a.state == "reviewing"


def test_retuned_bounds_change_the_outcome(monkeypatch):
    monkeypatch.setattr(policy, "MIN_SCENARIOS", MIN_SCENARIOS + 1)
    monkeypatch.setattr(policy, "MAX_SCENARIOS", MAX_SCENARIOS + 2)
    a = walk(fresh(MAX_SCENARIOS + 2), [False] * MIN_SCENARIOS)
    assert a.state == "answering"
    a = confirm_current(a)
    assert a.state == "reviewing"

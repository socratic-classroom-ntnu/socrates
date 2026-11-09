"""The solo-activity state table (plan 2026-10-20 §狀態轉換表), as pure functions."""

from dataclasses import replace

import pytest

from app.modules.llm_runtime.contracts import Observations
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import attempt_machine as sm
from app.modules.llm_runtime.contracts import PersonalSummary, PersonalTutorTurn

T0 = 1_000.0


def fresh(count: int = 1) -> sm.AttemptState:
    return sm.new_attempt("att-1", [sm.Scenario(f"s{i}", f"情境{i}") for i in range(count)])


def turn(**observed) -> PersonalTutorTurn:
    flags = {
        "has_position": True,
        "has_reason": True,
        "reason_tested": True,
        "position_shifted": False,
        "principle_label": "義務論",
        **observed,
    }
    return PersonalTutorTurn(
        reply_text="你說的「不能」是指什麼？",
        observations=Observations(**flags),
        summary=PersonalSummary(current_position="不拉", reason_summary="不能把人當工具"),
    )


def in_dialogue(count: int = 1) -> sm.AttemptState:
    """Answer submitted and the opening follow-up received (turn 0 never confirms)."""
    a, pending = sm.send_message(fresh(count), "不能主動害人", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None
    return result


def confirming(count: int = 1) -> sm.AttemptState:
    a, pending = sm.send_message(in_dialogue(count), "回覆", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None and result.state == "confirming"
    return result


def awaiting() -> sm.AttemptState:
    a, _ = sm.send_message(fresh(), "救五個人", T0)
    return a


def unavailable() -> sm.AttemptState:
    a, pending = sm.send_message(fresh(), "救五個人", T0)
    result = sm.tutor_failed(a, pending.key, "tutor_unavailable")
    assert result is not None
    return result


def between() -> sm.AttemptState:
    a = confirming(count=2)
    return sm.confirm_viewpoint(a, a.progress[0].summary_digest or "")


def reviewing() -> sm.AttemptState:
    a = confirming()
    return sm.confirm_viewpoint(a, a.progress[0].summary_digest or "")


@pytest.mark.parametrize(
    ("build", "expected"),
    [
        (fresh, ["send_message"]),
        (unavailable, ["retry"]),
        (in_dialogue, ["send_message"]),
        (confirming, ["confirm_viewpoint", "revise_viewpoint"]),
        (between, ["next_scenario"]),
        (reviewing, ["submit_review"]),
    ],
)
def test_actions_per_state(build, expected):
    assert sm.actions_for(build(), T0) == expected


def test_awaiting_tutor_offers_retry_only_when_stale():
    a = awaiting()
    assert a.state == "awaiting_tutor"
    assert sm.actions_for(a, T0 + 149) == []
    assert sm.actions_for(a, T0 + 151) == ["retry"]


@pytest.mark.parametrize(
    "state", ["awaiting_reflection_prompt", "reflecting", "budget_exhausted", "completed"]
)
def test_unbuilt_states_offer_nothing(state):
    assert sm.actions_for(replace(fresh(), state=state), T0) == []


def test_opening_turn_never_advances():
    a, pending = sm.send_message(fresh(), "不能主動害人", T0)
    assert pending.turn_index == 0
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None
    assert result.state == "in_dialogue"
    assert result.progress[0].candidate_summary is None


def test_policy_decides_confirmation():
    a, pending = sm.send_message(in_dialogue(), "回覆", T0)
    assert pending.turn_index == 1
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None
    assert result.state == "confirming"
    current = result.progress[0]
    assert current.candidate_summary == {
        "current_position": "不拉",
        "reason_summary": "不能把人當工具",
        "relevant_conditions": [],
        "unresolved_issue": "",
        "principle_note": "",
    }
    assert current.summary_digest is not None and len(current.summary_digest) == 32
    assert current.principle_label == "義務論"
    assert result.pending_key is None


def test_goal_not_met_keeps_dialogue():
    a, pending = sm.send_message(in_dialogue(), "回覆", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))
    assert result is not None and result.state == "in_dialogue"


def test_position_shift_vetoes():
    a, pending = sm.send_message(in_dialogue(), "回覆", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn(position_shifted=True))
    assert result is not None and result.state == "in_dialogue"


def test_shift_holds_confirmation_one_more_turn():
    a, pending = sm.send_message(in_dialogue(), "回覆", T0)
    a = sm.apply_tutor_turn(a, pending.key, turn(position_shifted=True))
    assert a is not None and a.state == "in_dialogue"
    assert a.current.last_shift_turn == 1
    # The turn right after the shift: everything met, but the new position has not been probed yet.
    a, pending = sm.send_message(a, "回覆", T0)
    a = sm.apply_tutor_turn(a, pending.key, turn())
    assert a is not None and a.state == "in_dialogue"
    a, pending = sm.send_message(a, "回覆", T0)
    a = sm.apply_tutor_turn(a, pending.key, turn())
    assert a is not None and a.state == "confirming"


def test_stale_result_ignored():
    a, first = sm.send_message(fresh(), "救五個人", T0)
    a, second = sm.retry(a, T0 + 151)
    assert first.key != second.key
    assert sm.apply_tutor_turn(a, first.key, turn()) is None
    assert sm.tutor_failed(a, first.key, "tutor_unavailable") is None
    applied = sm.apply_tutor_turn(a, second.key, turn())
    assert applied is not None and applied.state == "in_dialogue"
    # A duplicate of the result that was just applied arrives in in_dialogue.
    assert sm.apply_tutor_turn(applied, second.key, turn()) is None


def test_retry_after_failure_uses_the_same_turn():
    a = unavailable()
    assert a.notice == "tutor_unavailable"
    retried, pending = sm.retry(a, T0 + 5)
    assert retried.state == "awaiting_tutor"
    assert retried.notice is None
    assert pending.turn_index == 0
    assert retried.pending_since == T0 + 5


def test_confirm_requires_current_digest():
    a = confirming()
    with pytest.raises(DomainError) as error:
        sm.confirm_viewpoint(a, "0" * 32)
    assert (error.value.code, error.value.status) == ("SOLO_SUMMARY_STALE", 409)


def test_confirm_last_scenario_goes_to_review():
    a = confirming()
    current = a.progress[0]
    done = sm.confirm_viewpoint(a, current.summary_digest or "")
    assert done.state == "reviewing"
    assert done.progress[0].status == "goal_met"
    assert done.progress[0].confirmed_summary == current.candidate_summary


def test_revise_returns_to_dialogue():
    a = confirming()
    revised = sm.revise_viewpoint(a)
    assert revised.state == "in_dialogue"
    assert revised.progress[0].candidate_summary is None
    assert revised.progress[0].summary_digest is None
    assert revised.progress[0].turn_index == a.progress[0].turn_index == 1


def test_the_answer_is_kept_as_the_students_own_words():
    a, _ = sm.send_message(fresh(), "我會拉，因為五條命比一條多", T0)
    assert a.current.answer == "我會拉，因為五條命比一條多"
    assert a.current.turn_index == 0


def test_the_first_answer_takes_no_hint():
    with pytest.raises(DomainError) as error:
        sm.send_message(fresh(), "我會拉", T0, revise_hint="reason")
    assert (error.value.code, error.value.status) == ("SOLO_REVISE_HINT_INVALID", 422)


def test_the_first_answer_does_not_count_against_the_message_limit():
    a, pending = sm.send_message(fresh(), "我會拉", T0)
    assert pending.turn_index == 0
    assert a.current.turn_index == 0


def test_a_hint_needs_a_rejected_summary():
    with pytest.raises(DomainError) as error:
        sm.send_message(in_dialogue(), "回覆", T0, revise_hint="reason")
    assert (error.value.code, error.value.status) == ("SOLO_REVISE_HINT_INVALID", 422)


@pytest.mark.parametrize("hint", ["stance", "reason", "condition", "changed_mind"])
def test_every_revise_hint_goes_back_to_the_dialogue(hint):
    revised = sm.revise_viewpoint(confirming())
    sent, pending = sm.send_message(revised, "回覆", T0, revise_hint=hint)
    assert sent.state == "awaiting_tutor"
    assert (sent.current.revising, sent.current.rejected_summary) == (False, None)
    assert pending.turn_index == 2


def test_unavailable_action_rejected():
    with pytest.raises(DomainError) as error:
        sm.send_message(reviewing(), "回覆", T0)
    assert (error.value.code, error.value.status) == ("SOLO_ACTION_UNAVAILABLE", 409)
    with pytest.raises(DomainError):
        sm.retry(awaiting(), T0 + 10)


def test_message_limit_per_scenario():
    a = in_dialogue()
    # The first answer is the first student message; 39 more fit under the limit of 40.
    for _ in range(39):
        a, pending = sm.send_message(a, "回覆", T0)
        applied = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))
        assert applied is not None
        a = applied
    with pytest.raises(DomainError) as error:
        sm.send_message(a, "回覆", T0)
    assert (error.value.code, error.value.status) == ("SOLO_MESSAGE_LIMIT", 409)


def test_confirm_with_more_scenarios_goes_between():
    a = between()
    assert a.state == "between_scenarios"
    assert a.scenario_index == 0
    assert a.progress[0].status == "goal_met"
    assert a.progress[1].status == "in_progress"


def test_next_scenario_moves_index_and_starts_from_nothing():
    first = between()
    a = sm.next_scenario(first)
    assert a.state == "answering"
    assert a.scenario_index == 1
    assert sm.actions_for(a, T0) == ["send_message"]
    # The first scenario's answer stays; the new one starts from nothing.
    assert a.progress[0] == first.progress[0]
    assert a.current == sm.ScenarioProgress(scenario_id="s1", text="情境1")
    a, pending = sm.send_message(a, "救五個人", T0)
    assert (pending.scenario_index, pending.turn_index) == (1, 0)
    assert pending.key == "att-1:1:0:0"
    # The first scenario's shift does not hold the second scenario's confirmation.
    assert a.current.last_shift_turn is None


def test_next_scenario_only_between_scenarios():
    for build in (reviewing, in_dialogue, confirming):
        with pytest.raises(DomainError) as error:
            sm.next_scenario(build())
        assert (error.value.code, error.value.status) == ("SOLO_ACTION_UNAVAILABLE", 409)


def test_revise_keeps_rejected_summary_until_next_message():
    a = confirming()
    rejected = a.current.candidate_summary
    revised = sm.revise_viewpoint(a)
    assert revised.current.revising is True
    assert revised.current.rejected_summary == rejected
    sent, _ = sm.send_message(revised, "回覆", T0)
    assert sent.current.revising is False
    assert sent.current.rejected_summary is None


def test_a_pulled_back_turn_never_confirms():
    """Two iron-rule failures: the pull-back sentence is shown, nothing the model said is used."""
    a, pending = sm.send_message(in_dialogue(), "回覆", T0)

    result = sm.apply_pulled_back_turn(a, pending.key)

    assert result is not None
    assert result.state == "in_dialogue"
    assert (result.pending_key, result.pending_since) == (None, None)
    assert result.current.candidate_summary is None
    assert result.current.summary_digest is None
    assert result.current.last_shift_turn == a.current.last_shift_turn


def test_a_stale_pulled_back_turn_changes_nothing():
    a, first = sm.send_message(in_dialogue(), "回覆", T0)
    a = sm.tutor_failed(a, first.key, "tutor_unavailable")
    assert a is not None

    assert sm.apply_pulled_back_turn(a, first.key) is None

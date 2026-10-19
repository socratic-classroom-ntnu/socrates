"""The solo-activity state table (plan 2026-10-20 §狀態轉換表), as pure functions."""

from dataclasses import replace

import pytest

from app.modules.llm_runtime.domain.tutor import Observations
from app.modules.platform.errors import DomainError
from app.modules.solo_dialogue.domain import solo_attempt as sm
from app.modules.solo_dialogue.domain.solo_outputs import SoloSummary, SoloTutorTurn

OPTIONS = {"o0", "o1"}
T0 = 1_000.0


def fresh(count: int = 1) -> sm.AttemptState:
    return sm.new_attempt("att-1", [f"q{i}" for i in range(count)])


def turn(**observed) -> SoloTutorTurn:
    flags = {
        "has_position": True,
        "has_reason": True,
        "reason_tested": True,
        "position_shifted": False,
        "principle_label": "義務論",
        **observed,
    }
    return SoloTutorTurn(
        reply_text="你說的「不能」是指什麼？",
        observations=Observations(**flags),
        summary=SoloSummary(current_position="不拉", reason_summary="不能把人當工具"),
    )


def in_dialogue(count: int = 1) -> sm.AttemptState:
    """Stance submitted and the opening follow-up received (turn 0 never confirms)."""
    a, pending = sm.submit_stance(fresh(count), "o1", "不能主動害人", OPTIONS, T0)
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None
    return result


def confirming(count: int = 1) -> sm.AttemptState:
    a, pending = sm.send_message(in_dialogue(count), T0)
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None and result.state == "confirming"
    return result


def awaiting() -> sm.AttemptState:
    a, _ = sm.submit_stance(fresh(), "o0", "救五個人", OPTIONS, T0)
    return a


def unavailable() -> sm.AttemptState:
    a, pending = sm.submit_stance(fresh(), "o0", "救五個人", OPTIONS, T0)
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
        (fresh, ["submit_stance"]),
        (unavailable, ["retry"]),
        (in_dialogue, ["send_message"]),
        (confirming, ["confirm_viewpoint", "revise_viewpoint"]),
        (between, ["next_question"]),
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
    a, pending = sm.submit_stance(fresh(), "o1", "不能主動害人", OPTIONS, T0)
    assert pending.turn_index == 0
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None
    assert result.state == "in_dialogue"
    assert result.progress[0].candidate_summary is None


def test_policy_decides_confirmation():
    a, pending = sm.send_message(in_dialogue(), T0)
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
    a, pending = sm.send_message(in_dialogue(), T0)
    result = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))
    assert result is not None and result.state == "in_dialogue"


def test_position_shift_vetoes():
    a, pending = sm.send_message(in_dialogue(), T0)
    result = sm.apply_tutor_turn(a, pending.key, turn(position_shifted=True))
    assert result is not None and result.state == "in_dialogue"


def test_shift_holds_confirmation_one_more_turn():
    a, pending = sm.send_message(in_dialogue(), T0)
    a = sm.apply_tutor_turn(a, pending.key, turn(position_shifted=True))
    assert a is not None and a.state == "in_dialogue"
    assert a.current.last_shift_turn == 1
    # The turn right after the shift: everything met, but the new stance has not been probed yet.
    a, pending = sm.send_message(a, T0)
    a = sm.apply_tutor_turn(a, pending.key, turn())
    assert a is not None and a.state == "in_dialogue"
    a, pending = sm.send_message(a, T0)
    a = sm.apply_tutor_turn(a, pending.key, turn())
    assert a is not None and a.state == "confirming"


def test_stale_result_ignored():
    a, first = sm.submit_stance(fresh(), "o0", "救五個人", OPTIONS, T0)
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


def test_confirm_last_question_goes_to_review():
    a = confirming()
    current = a.progress[0]
    done = sm.confirm_viewpoint(a, current.summary_digest or "")
    assert done.state == "reviewing"
    assert done.progress[0].status == "goal_met"
    assert done.progress[0].confirmed_summary == current.candidate_summary
    assert done.progress[0].final_option_id == "o1"


def test_revise_returns_to_dialogue():
    a = confirming()
    revised = sm.revise_viewpoint(a)
    assert revised.state == "in_dialogue"
    assert revised.progress[0].candidate_summary is None
    assert revised.progress[0].summary_digest is None
    assert revised.progress[0].turn_index == a.progress[0].turn_index == 1


def test_invalid_option_rejected():
    with pytest.raises(DomainError) as error:
        sm.submit_stance(fresh(), "nope", "理由", OPTIONS, T0)
    assert (error.value.code, error.value.status) == ("SOLO_OPTION_INVALID", 422)


def test_unavailable_action_rejected():
    with pytest.raises(DomainError) as error:
        sm.send_message(fresh(), T0)
    assert (error.value.code, error.value.status) == ("SOLO_ACTION_UNAVAILABLE", 409)
    with pytest.raises(DomainError):
        sm.retry(awaiting(), T0 + 10)


def test_message_limit_per_question():
    a = in_dialogue()
    # The stance's reason is the first student message; 39 more fit under the limit of 40.
    for _ in range(39):
        a, pending = sm.send_message(a, T0)
        applied = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))
        assert applied is not None
        a = applied
    with pytest.raises(DomainError) as error:
        sm.send_message(a, T0)
    assert (error.value.code, error.value.status) == ("SOLO_MESSAGE_LIMIT", 409)


def test_confirm_with_more_questions_goes_between():
    a = between()
    assert a.state == "between_questions"
    assert a.question_index == 0
    assert a.progress[0].status == "goal_met"
    assert a.progress[1].status == "in_progress"


def test_next_question_moves_index_and_resets_stance():
    first = between()
    a = sm.next_question(first)
    assert a.state == "choosing_stance"
    assert a.question_index == 1
    assert sm.actions_for(a, T0) == ["submit_stance"]
    # The first question's answer stays; the new one starts from nothing.
    assert a.progress[0] == first.progress[0]
    assert a.current == sm.QuestionProgress(question_id="q1")
    a, pending = sm.submit_stance(a, "o0", "救五個人", OPTIONS, T0)
    assert (pending.question_index, pending.turn_index) == (1, 0)
    assert pending.key == "att-1:1:0:0"
    # The first question's shift does not hold the second question's confirmation.
    assert a.current.last_shift_turn is None


def test_next_question_only_between_questions():
    for build in (reviewing, in_dialogue, confirming):
        with pytest.raises(DomainError) as error:
            sm.next_question(build())
        assert (error.value.code, error.value.status) == ("SOLO_ACTION_UNAVAILABLE", 409)


def test_revise_keeps_rejected_summary_until_next_message():
    a = confirming()
    rejected = a.current.candidate_summary
    revised = sm.revise_viewpoint(a)
    assert revised.current.revising is True
    assert revised.current.rejected_summary == rejected
    sent, _ = sm.send_message(revised, T0)
    assert sent.current.revising is False
    assert sent.current.rejected_summary is None

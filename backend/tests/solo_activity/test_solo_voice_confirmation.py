"""Voice mode, step 1: when the student's spoken answer to a read-out summary confirms it.

In voice mode there is no card to press: Socrates reads the summary aloud and asks whether it is
right, and the student answers in speech. A small classifier sorts the answer into agree,
disagree, addition ("對，但我想補充…") or unclear ("嗯", "應該吧"); these tests feed its output
by hand. Only an explicit agreement to a summary the student heard to the end confirms it:

- agree, heard to the end: confirmed, exactly as 對 would.
- disagree: as 不太對, and what the student said goes on as their next message.
- addition: not confirmed and not turned down; the summary is withdrawn and the addition goes on
  as an ordinary message.
- unclear: asked once more; unclear again is treated like an addition.
- interrupted, or Socrates' words did not match the summary: never confirmed, whatever the
  answer; the summary is withdrawn and asked again later.

Out of messages (only 對 is offered) nothing but an agreement can move on: the question is asked
again, and after a second unclear answer the student gets the card to press.
"""

import pytest

from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity import voice_confirmation as vc
from tests.solo_activity.test_solo_empty_summary import reply, tutor_turn
from tests.solo_activity.test_solo_state_table import T0, in_dialogue


def confirming() -> sm.AttemptState:
    a = reply(in_dialogue(), tutor_turn())
    assert a.state == "confirming"
    return a


def decide(answer: vc.VoiceAnswer, *, heard=True, asked=0, can_talk=True) -> vc.Decision:
    return vc.decide(answer, heard_in_full=heard, unclear_asks=asked, can_still_talk=can_talk)


# ---- the decision table --------------------------------------------------------------------


def test_only_an_explicit_agreement_heard_to_the_end_confirms():
    assert decide("agree") == "confirm"


@pytest.mark.parametrize("answer", ["agree", "disagree", "addition", "unclear"])
def test_nothing_confirms_a_summary_the_student_did_not_hear_to_the_end(answer):
    assert decide(answer, heard=False) == "withdraw"


def test_disagreeing_is_turning_the_summary_down():
    assert decide("disagree") == "revise"


def test_an_addition_is_neither_agreement_nor_refusal():
    assert decide("addition") == "withdraw"


def test_an_unclear_answer_is_asked_once_more_then_treated_as_not_confirmed():
    assert decide("unclear", asked=0) == "ask_again"
    assert decide("unclear", asked=1) == "withdraw"


@pytest.mark.parametrize("answer", ["disagree", "addition"])
def test_with_no_message_left_only_agreement_moves_on(answer):
    assert decide(answer, can_talk=False) == "ask_again"
    assert decide("agree", can_talk=False) == "confirm"


def test_with_no_message_left_a_second_unclear_answer_hands_over_the_card():
    assert decide("unclear", asked=0, can_talk=False) == "ask_again"
    assert decide("unclear", asked=1, can_talk=False) == "show_card"
    assert decide("addition", asked=1, can_talk=False) == "show_card"


def test_an_interrupted_summary_with_no_message_left_is_read_again():
    assert decide("agree", heard=False, can_talk=False) == "ask_again"


# ---- withdrawing a summary in the state machine --------------------------------------------


def test_withdrawing_returns_to_the_dialogue_without_counting_as_a_refusal():
    a = confirming()
    b = sm.withdraw_viewpoint(a, a.current.summary_digest)
    assert b.state == "in_dialogue"
    assert b.current.candidate_summary is None and b.current.summary_digest is None
    assert b.current.status == "in_progress"
    # Not 不太對: nothing is recorded as turned down and the revise hold does not start.
    assert b.current.revising is False
    assert b.current.rejected_summary is None
    assert b.current.last_revise_turn == a.current.last_revise_turn
    assert b.current.turn_index == a.current.turn_index
    assert sm.actions_for(b, T0) == ["send_message"]


def test_only_the_summary_being_read_can_be_withdrawn():
    a = confirming()
    with pytest.raises(sm.DomainError) as stale:
        sm.withdraw_viewpoint(a, "another digest")
    assert stale.value.code == "SOLO_SUMMARY_STALE"


def test_withdrawing_is_only_possible_while_confirming():
    with pytest.raises(sm.DomainError) as unavailable:
        sm.withdraw_viewpoint(in_dialogue(), "any")
    assert unavailable.value.code == "SOLO_ACTION_UNAVAILABLE"


def test_withdraw_is_not_an_action_the_student_is_offered():
    a = confirming()
    assert "withdraw_viewpoint" not in sm.actions_for(a, T0)


def test_after_withdrawing_the_next_message_is_an_ordinary_turn():
    a = confirming()
    b = sm.withdraw_viewpoint(a, a.current.summary_digest)
    c, pending = sm.send_message(b, "對，但我想補充：如果那個人是自願的就不一樣", T0)
    assert c.state == "awaiting_tutor"
    assert pending.turn_index == a.current.turn_index + 1
    assert c.current.last_revise_turn is None

"""Voice mode: what the student's spoken answer to a summary read to them presses.

Voice has no confirmation rules of its own (one set serves typing and voice): the answer only
picks 對 or 不太對 at the point the backend offers. The judgment (voice_judge) gives a verdict,
whether the reading kept the summary's meaning, and whether the word list contradicts a yes:

- agree, meaning intact, not contradicted: 對.
- disagree or addition: 不太對, and the discussion goes on with what the student said.
- unclear, or a yes the student's own words contradict: asked once more; judged unclear twice,
  it is a failed confirmation and the discussion goes on.
- the reading bent the summary or was cut off: read once more; twice, the summary is taken back
  without counting as 不太對, whatever the answer.
"""

import pytest

from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity import voice_confirmation as vc
from tests.solo_activity.test_solo_empty_summary import reply, tutor_turn
from tests.solo_activity.test_solo_state_table import in_dialogue


def decide(verdict, *, faithful=True, vetoed=False, asks=0, reads=0) -> vc.Decision:
    return vc.decide(verdict, faithful=faithful, vetoed=vetoed, asks=asks, reads=reads)


def test_an_agreement_to_a_summary_that_reached_the_student_intact_confirms():
    assert decide("agree") == "confirm"


@pytest.mark.parametrize("verdict", ["disagree", "addition"])
def test_a_no_or_a_correction_is_a_failed_confirmation(verdict):
    assert decide(verdict) == "not_confirmed"


def test_an_unclear_answer_is_asked_once_more_then_counts_as_not_confirmed():
    assert decide("unclear") == "ask_again"
    assert decide("unclear", asks=1) == "not_confirmed"


def test_a_yes_the_students_own_words_contradict_is_never_a_confirmation():
    assert decide("agree", vetoed=True) == "ask_again"
    assert decide("agree", vetoed=True, asks=1) == "not_confirmed"


@pytest.mark.parametrize("verdict", ["agree", "disagree", "addition", "unclear"])
def test_a_reading_that_bent_the_summary_is_read_again_then_withdrawn_whatever_the_answer(verdict):
    assert decide(verdict, faithful=False) == "read_again"
    assert decide(verdict, faithful=False, reads=1) == "withdraw"


def test_the_limits_are_one_more_question_and_one_more_reading():
    assert vc.ASKS == 1 and vc.READS == 1


# ---- withdrawing, on the state machine ----------------------------------------------------------


def confirming() -> sm.AttemptState:
    a = reply(in_dialogue(), tutor_turn())
    assert a.state == "confirming"
    return a


def test_withdrawing_goes_back_to_the_dialogue_without_recording_a_rejection():
    a = confirming()
    back = sm.withdraw_viewpoint(a, a.current.summary_digest or "")
    assert back.state == "in_dialogue"
    assert back.current.candidate_summary is None
    assert back.current.rejected_summary is None and back.current.rejected_at == []


def test_only_the_summary_being_read_can_be_withdrawn():
    a = confirming()
    with pytest.raises(Exception) as stale:
        sm.withdraw_viewpoint(a, "not-this-one")
    assert getattr(stale.value, "code", None) == "SOLO_SUMMARY_STALE"

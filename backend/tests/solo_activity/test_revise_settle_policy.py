"""Solo only: after 不太對, the first student reply cannot confirm; one more turn must pass.

X1 promises the student the tutor may ask once or twice more; without this a reply like
「理由不太對。」 went straight back to confirmation. Callers that do not pass
``turns_since_revise`` (Round 1, the group dialogue) are unaffected.
"""

import pytest

from app.modules.llm_runtime.domain.tutor import Observations
from app.modules.solo_dialogue.orchestrator.policy import should_advance

MET = Observations(
    has_position=True,
    has_reason=True,
    reason_tested=True,
    principle_label="義務論",
    position_shifted=False,
)


def test_without_revise_history_the_rule_is_unchanged():
    assert should_advance(MET, turn_count=3, turns_since_revise=None) is True


def test_the_reply_right_after_revise_cannot_confirm():
    assert should_advance(MET, turn_count=5, turns_since_revise=0) is False


@pytest.mark.parametrize("turns_since_revise", [1, 2])
def test_one_turn_after_revise_may_confirm(turns_since_revise: int):
    assert should_advance(MET, turn_count=5, turns_since_revise=turns_since_revise) is True


def test_revise_does_not_lift_the_other_rules():
    shifted = MET.model_copy(update={"position_shifted": True})
    assert should_advance(MET, turn_count=0, turns_since_revise=3) is False
    assert should_advance(shifted, turn_count=5, turns_since_revise=3) is False
    assert should_advance(MET, turn_count=5, turns_since_shift=1, turns_since_revise=3) is False

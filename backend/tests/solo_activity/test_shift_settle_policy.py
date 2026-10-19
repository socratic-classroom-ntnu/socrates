"""Solo only: after a position shift, one more turn must pass before the stance can be confirmed.

The shift turn itself is vetoed by the shared rule (tests/invariants); this adds the turn after it.
Callers that do not pass ``turns_since_shift`` (Round 1, the group dialogue) are unaffected.
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


def test_without_shift_history_the_rule_is_unchanged():
    assert should_advance(MET, turn_count=3) is True
    assert should_advance(MET, turn_count=3, turns_since_shift=None) is True


@pytest.mark.parametrize("turns_since_shift", [0, 1])
def test_the_turn_after_a_shift_still_cannot_confirm(turns_since_shift: int):
    assert should_advance(MET, turn_count=5, turns_since_shift=turns_since_shift) is False


@pytest.mark.parametrize("turns_since_shift", [2, 3])
def test_two_turns_after_a_shift_may_confirm(turns_since_shift: int):
    assert should_advance(MET, turn_count=5, turns_since_shift=turns_since_shift) is True


def test_floor_and_shift_veto_still_apply():
    shifted = MET.model_copy(update={"position_shifted": True})
    assert should_advance(MET, turn_count=0, turns_since_shift=5) is False
    assert should_advance(shifted, turn_count=5, turns_since_shift=5) is False

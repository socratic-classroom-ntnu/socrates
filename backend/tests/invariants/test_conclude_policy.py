"""Solo only: whether the sequence of scenarios ends or extends after a confirmation.

The rule reads counts and flags, never the tutor's words. The floor and the ceiling are tunable
numbers in ``policy.py``; these tests read them from there, so retuning does not break them.
"""

import itertools

import pytest

from app.modules.llm_runtime import policy
from app.modules.llm_runtime.policy import MAX_SCENARIOS, MIN_SCENARIOS, should_conclude
from app.modules.llm_runtime.service import should_conclude as public_should_conclude


def test_starting_values_are_two_and_four():
    assert (MIN_SCENARIOS, MAX_SCENARIOS) == (2, 4)


def test_floor_does_not_exceed_ceiling():
    assert 1 <= MIN_SCENARIOS <= MAX_SCENARIOS


@pytest.mark.parametrize("shifted", [False, True])
def test_below_the_floor_always_extends(shifted: bool):
    for confirmed in range(0, MIN_SCENARIOS):
        assert should_conclude(confirmed, shifted_in_latest=shifted) is False


@pytest.mark.parametrize("shifted", [False, True])
def test_at_or_above_the_ceiling_always_concludes(shifted: bool):
    for confirmed in (MAX_SCENARIOS, MAX_SCENARIOS + 1, MAX_SCENARIOS + 5):
        assert should_conclude(confirmed, shifted_in_latest=shifted) is True


def test_between_floor_and_ceiling_a_settled_view_concludes():
    for confirmed in range(MIN_SCENARIOS, MAX_SCENARIOS):
        assert should_conclude(confirmed, shifted_in_latest=False) is True


def test_between_floor_and_ceiling_a_shift_in_the_latest_scenario_extends():
    # The new view has been tested in one scenario only; another scenario tests it again.
    for confirmed in range(MIN_SCENARIOS, MAX_SCENARIOS):
        assert should_conclude(confirmed, shifted_in_latest=True) is False


def test_truth_table_over_counts_and_flag():
    for confirmed, shifted in itertools.product(range(0, MAX_SCENARIOS + 3), [False, True]):
        if confirmed < MIN_SCENARIOS:
            expected = False
        elif confirmed >= MAX_SCENARIOS:
            expected = True
        else:
            expected = not shifted
        assert should_conclude(confirmed, shifted_in_latest=shifted) is expected, (
            confirmed,
            shifted,
        )


def test_the_bounds_are_read_at_call_time(monkeypatch):
    monkeypatch.setattr(policy, "MIN_SCENARIOS", 3)
    monkeypatch.setattr(policy, "MAX_SCENARIOS", 6)
    assert should_conclude(2, shifted_in_latest=False) is False
    assert should_conclude(3, shifted_in_latest=False) is True
    assert should_conclude(5, shifted_in_latest=True) is False
    assert should_conclude(6, shifted_in_latest=True) is True


def test_other_modules_reach_it_through_the_service():
    assert public_should_conclude(2, shifted_in_latest=False) is should_conclude(
        2, shifted_in_latest=False
    )
    assert public_should_conclude(1, shifted_in_latest=False) is False

import itertools

import pytest

from app.domain.tutor import Observations
from app.orchestrator.policy import should_advance, stage_goal_met


def _obs(has_position: bool, has_reason: bool, reason_tested: bool, shifted: bool):
    return Observations(
        has_position=has_position,
        has_reason=has_reason,
        reason_tested=reason_tested,
        principle_label="未明",
        position_shifted=shifted,
    )


@pytest.mark.parametrize(
    "has_position,has_reason,reason_tested", list(itertools.product([True, False], repeat=3))
)
def test_goal_met_is_conjunction_of_three_conditions(
    has_position: bool, has_reason: bool, reason_tested: bool
):
    """設計規格 §4.3：三條件必須同時成立。

    沒被測試過的表態只是直覺，不是已經照見的立場。"""
    obs = _obs(has_position, has_reason, reason_tested, shifted=False)
    expected = has_position and has_reason and reason_tested
    assert stage_goal_met(obs) is expected


@pytest.mark.parametrize("turn_count", [0, 1, 2])
@pytest.mark.parametrize(
    "has_position,has_reason,reason_tested,shifted",
    list(itertools.product([True, False], repeat=4)),
)
def test_should_advance_truth_table(
    has_position: bool, has_reason: bool, reason_tested: bool, shifted: bool, turn_count: int
):
    """完整判準：地板 + 三條件 + 立場未改變。

    設計規格 §4.4：學生剛改變立場時不得推進，即使三條件齊備——
    這是整段對話最有價值的一刻，該追問「哪裡不一樣」，
    此時放人走等於把最好的鏡子收起來。
    """
    obs = _obs(has_position, has_reason, reason_tested, shifted)
    expected = turn_count >= 1 and (not shifted) and has_position and has_reason and reason_tested
    assert should_advance(obs, turn_count) is expected


def test_first_turn_cannot_advance_even_if_provider_misreports():
    """地板是明文執行的，不是推導出來的。

    「`reason_tested` 在第一輪不可能為真（教授還沒問）」是對 provider 誠實的
    **假設**，不是保證。模型錯報時學生會一輪過關——鏡子根本沒照到，
    而那正是這個產品唯一要做的事。所以地板必須被執行，不能被推論。
    """
    misreported = _obs(has_position=True, has_reason=True, reason_tested=True, shifted=False)
    assert should_advance(misreported, turn_count=0) is False

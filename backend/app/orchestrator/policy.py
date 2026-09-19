from app.domain.tutor import Observations


def stage_goal_met(obs: Observations) -> bool:
    """設計規格 §4.3 的三條件。

    **這是判準的唯一修改點。** 要調整鬆緊改這裡，
    對應的真值表測試會跟著紅燈——那正是它的用途。
    """
    return obs.has_position and obs.has_reason and obs.reason_tested


def should_advance(obs: Observations, turn_count: int) -> bool:
    """完整的推進判準：地板 + 三條件 + 立場未改變。

    `turn_count` 是本階**已完成**的來回數（本輪尚未計入），因此 `turn_count == 0`
    代表這是第一輪。

    地板不可省略。「`reason_tested` 在第一輪不可能為真」是對 provider 誠實的假設，
    不是保證——模型錯報時學生會一輪過關。設計規格 §4.4 的否決規則也在此。
    """
    if turn_count < 1:
        return False
    if obs.position_shifted:
        return False
    return stage_goal_met(obs)

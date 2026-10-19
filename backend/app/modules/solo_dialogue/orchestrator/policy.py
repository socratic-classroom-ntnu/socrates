from app.modules.llm_runtime.domain.tutor import Observations


def stage_goal_met(obs: Observations) -> bool:
    """設計規格 §4.3 的三條件。

    **這是判準的唯一修改點。** 要調整鬆緊改這裡，
    對應的真值表測試會跟著紅燈——那正是它的用途。
    """
    return obs.has_position and obs.has_reason and obs.reason_tested


# 單人活動：距離立場改變那一輪（算 0）至少要過這麼多輪，才可以確認；即改變後的下一輪仍不確認。
TURNS_AFTER_SHIFT = 2


def should_advance(
    obs: Observations, turn_count: int, turns_since_shift: int | None = None
) -> bool:
    """完整的推進判準：地板 + 三條件 + 立場未改變。

    `turn_count` 是本階**已完成**的來回數（本輪尚未計入），因此 `turn_count == 0`
    代表這是第一輪。

    `turns_since_shift` 是距離最近一次「立場改變」那一輪已經過的輪數（沒有改變過就是
    None）。單人活動用它把確認再延後一輪。

    地板不可省略。「`reason_tested` 在第一輪不可能為真」是對 provider 誠實的假設，
    不是保證——模型錯報時學生會一輪過關。設計規格 §4.4 的否決規則也在此。
    """
    if turn_count < 1:
        return False
    if obs.position_shifted:
        return False
    # 改變立場的那一輪已由上一條擋下；下一輪新立場才剛被問到一次，還沒經過檢驗。
    # 只有單人活動傳入 turns_since_shift，Round 1 與分組課不受影響。
    if turns_since_shift is not None and turns_since_shift < TURNS_AFTER_SHIFT:
        return False
    return stage_goal_met(obs)

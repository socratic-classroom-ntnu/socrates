"""壞格式的模型輸出要被擋下，不能流進狀態機：推進判準會用到垃圾資料。

單人活動的導師回覆要通過 PersonalTutorTurn 的驗證（solo_activity/service.py 的 _call_tutor）；
不合格、缺欄位或 provider 直接丟例外，都只會讓這一輪變成 tutor_unavailable、可以重試，
不會存下導師訊息，也不會出現整理卡。
"""

import pytest

from tests.solo_activity.test_solo_attempts_api import MET, OPENING, answer, do, ok, setup, start

MISSING_OBSERVATIONS = {key: value for key, value in MET.items() if key != "observations"}
MISSING_FIELD = {
    **MET,
    "observations": {k: v for k, v in MET["observations"].items() if k != "position_shifted"},
}


@pytest.mark.parametrize(
    "reply",
    [MISSING_OBSERVATIONS, MISSING_FIELD, RuntimeError("provider 連線中斷")],
    ids=["missing-observations", "missing-observation-field", "provider-exception"],
)
def test_a_bad_reply_is_a_failure_not_a_turn(client, tutor, reply):
    _, replies = tutor
    attempt = ok(start(client, setup(client)["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"])
    # Enough copies that every regeneration the iron rules may ask for gets the same bad reply.
    replies.extend([reply] * 4)

    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))

    assert view["state"] == "tutor_unavailable"
    assert view["available_actions"] == ["retry"]
    assert view["candidate_summary"] is None
    assert [m["role"] for m in view["messages"]] == ["student", "tutor", "student"]

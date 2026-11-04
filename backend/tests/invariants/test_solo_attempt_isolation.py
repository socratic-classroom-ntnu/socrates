"""一個學生的單人活動紀錄只有他自己讀得到、動得了；同學與開課老師都當作不存在。"""

from tests.course_management.conftest import switch
from tests.solo_activity.test_solo_attempts_api import do, join, ok, setup, start

NOT_FOUND = (404, {"detail": "SOLO_ATTEMPT_NOT_FOUND"})


def test_another_account_cannot_read_or_act_on_an_attempt(client, tutor):
    calls, _ = tutor
    s = setup(client)
    attempt_id = ok(start(client, s["activity_id"]))["id"]
    join(client, s["course"], "classmate")
    for account in (None, s["teacher"]):
        if account is not None:
            switch(client, account)
        read = client.get(f"/api/v2/solo/attempts/{attempt_id}")
        act = do(client, attempt_id, "submit_stance", {"option_id": "o1", "reason": "冒名"})
        assert (read.status_code, read.json()) == NOT_FOUND
        assert (act.status_code, act.json()) == NOT_FOUND
    assert calls == []
    switch(client, s["student"])
    view = ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))
    assert (view["state"], view["messages"]) == ("choosing_stance", [])

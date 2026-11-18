"""未進入的情境不回傳（情境的文字就是它的 title）。

學生若知道下一個情境是什麼，答第一個時就會自我保護，鏡子照不到真實直覺。
"""

from tests.solo_activity.test_solo_attempts_api import (
    OPENING,
    SCENARIO,
    add_scenario,
    do,
    ok,
    setup,
    start,
)

HIDDEN = ["你站在天橋上", "五位病人各自"]


def test_no_response_mentions_a_scenario_not_yet_reached(client, tutor):
    _, replies = tutor
    s = setup(client)
    responses = [
        client.get(f"/api/v2/solo/activities/{s['activity_id']}"),
        start(client, s["activity_id"]),
    ]
    attempt = ok(responses[-1])
    add_scenario(attempt["id"], "你站在天橋上，旁邊有一位陌生人。", scenario_id="s2")
    add_scenario(attempt["id"], "五位病人各自需要不同的器官。", scenario_id="s3")
    replies.append(OPENING)
    responses.append(do(client, attempt["id"], "send_message", {"text": "救五個"}))
    responses.append(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))
    responses.append(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))
    for response in responses:
        body = response.content.decode()
        assert response.status_code == 200, body
        assert [word for word in HIDDEN if word in body] == []
    assert SCENARIO in responses[-2].content.decode()

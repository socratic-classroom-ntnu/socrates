"""未進入的題目不回傳 title（也不回傳情境）。

學生若知道下一題是什麼，答第一題時就會自我保護，鏡子照不到真實直覺。
"""

from tests.course_management.test_activities_api import question
from tests.solo_activity.test_solo_attempts_api import OPENING, do, ok, setup, start

QUESTIONS = [
    question("q1", "岔道上的選擇"),
    {**question("q2", "天橋上的胖子"), "scenario": "你站在天橋上，旁邊有一位陌生人。"},
    {**question("q3", "器官移植的醫生"), "scenario": "五位病人各自需要不同的器官。"},
]
HIDDEN = ["天橋上的胖子", "你站在天橋上", "器官移植的醫生", "五位病人各自"]


def test_no_response_mentions_a_question_not_yet_reached(client, tutor):
    _, replies = tutor
    s = setup(client, questions=QUESTIONS)
    responses = [
        client.get(f"/api/v2/solo/activities/{s['activity_id']}"),
        start(client, s["activity_id"]),
    ]
    attempt = ok(responses[-1])
    replies.append(OPENING)
    responses.append(
        do(client, attempt["id"], "submit_stance", {"option_id": "o0", "reason": "救五個"})
    )
    responses.append(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))
    responses.append(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))
    for response in responses:
        body = response.content.decode()
        assert response.status_code == 200, body
        assert [word for word in HIDDEN if word in body] == []
    assert "岔道上的選擇" in responses[-2].content.decode()

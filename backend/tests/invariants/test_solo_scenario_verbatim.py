"""設計規格 §4.2：學生看到的情境逐字取自老師的題目，不經 LLM。

經典難題的效力在於敘述的精確——哪些細節給了、哪些刻意沒給都是設計。讓模型「用自己的話說一遍」
會稀釋掉它，也破壞可重現性。單人活動裡，情境（scenario）在任何 provider 呼叫之前就已經顯示，
之後無論導師回了什麼，畫面上的情境都是老師寫的那一段；導師拿到的也是同一段原文。
"""

import json

from tests.course_management.test_activities_api import question
from tests.solo_activity.test_solo_attempts_api import MET, OPENING, do, ok, setup, stance, start

FIRST = (
    "一輛失控的電車正駛向五名工人。\n你站在拉桿旁：拉下它，電車會轉向另一條軌道，那裡有一名工人。"
)
SECOND = "你站在天橋上，旁邊有一位陌生人。\n把他推下去可以擋住電車，救下五個人。"
RESTATED = "簡單說，就是犧牲一個人救五個人的情況。你會怎麼選？"


def test_the_scenario_is_the_teachers_text_before_any_provider_call(client, tutor):
    calls, _ = tutor
    s = setup(client, questions=[{**question("q1", "岔道"), "scenario": FIRST}])
    attempt = ok(start(client, s["activity_id"]))
    assert calls == []
    assert attempt["questions"][0]["scenario"] == FIRST
    assert (
        ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))["questions"][0]["scenario"]
        == FIRST
    )


def test_a_tutor_reply_never_replaces_the_scenario(client, tutor):
    calls, replies = tutor
    questions = [
        {**question("q1", "岔道"), "scenario": FIRST},
        {**question("q2", "天橋"), "scenario": SECOND},
    ]
    attempt = ok(start(client, setup(client, questions=questions)["activity_id"]))

    replies.append({**OPENING, "reply_text": RESTATED})
    view = stance(client, attempt["id"])
    assert view["questions"][0]["scenario"] == FIRST
    # The tutor is given the original, and its restatement stays a tutor message.
    assert json.loads(calls[-1]["messages"][1]["content"])["question"]["scenario"] == FIRST
    assert [m["text"] for m in view["messages"] if m["role"] == "tutor"] == [RESTATED]

    replies.append({**MET, "reply_text": RESTATED})
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    view = ok(
        do(client, attempt["id"], "confirm_viewpoint", {"summary_digest": view["summary_digest"]})
    )
    view = ok(do(client, attempt["id"], "next_question"))

    # The next question opens with its own scenario, verbatim, before the tutor speaks again.
    assert [q["scenario"] for q in view["questions"]] == [FIRST, SECOND]
    assert len(calls) == 2

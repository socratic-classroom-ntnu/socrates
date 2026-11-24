"""Ken 2: a narrative activity's student states a position in free text, and stance_classify places it
in the stance space locked into the revision; a change of mind places it again and the earlier
stance stays on the record. Every student message keeps its language.

Classification never holds the student up: it runs after the tutor's reply is shown, and a failed
or unusable one records nothing. Only the teacher's transcript reads the stances.
"""

import json

from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import act, create_activity
from tests.course_management.test_activity_expansion import EXPANSION
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import (
    NOT_MET,
    OPENING,
    SCENARIO,
    answer,
    configure_ai,
    join,
    ok,
    start,
)

HOLDS = {**NOT_MET, "observations": {**NOT_MET["observations"], "has_position": True}}
SHIFTED = {**HOLDS, "observations": {**HOLDS["observations"], "position_shifted": True}}
VAGUE = {**NOT_MET, "observations": {**NOT_MET["observations"], "has_position": False}}
PULL = {"stance_id": "s1", "confidence": "high", "rationale": "學生說救五個人比較重要。"}
REFUSE = {"stance_id": "s2", "confidence": "medium", "rationale": "學生說不能主動害人。"}


def setup(client, *, expansion=True, locale=None):
    teacher = user(client, "owner", account_role="teacher")
    configure_ai(client)
    course = create_course(client)
    activity = create_activity(client, course["id"], title="電車難題", scenario=SCENARIO)
    if expansion:
        put = client.put(f"/api/v2/activities/{activity['id']}/expansion", json=EXPANSION)
        assert put.status_code == 200, put.text
    assert act(client, activity["id"], "publish").status_code == 200
    student = join(client, course, "student")
    if locale is not None:
        assert client.put("/api/v2/account/locale", json={"locale": locale}).status_code == 200
    return {"teacher": teacher, "student": student, "activity_id": activity["id"]}


def transcript(client, s):
    switch(client, s["teacher"])
    students = client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress").json()["students"]
    enrollment_id = students[0]["enrollment_id"]
    response = client.get(
        f"/api/v2/solo/activities/{s['activity_id']}/students/{enrollment_id}/attempt"
    )
    assert response.status_code == 200, response.text
    return response.json()["attempt"]


def classify_calls(calls):
    contexts = (json.loads(call["messages"][1]["content"]) for call in calls)
    return [context for context in contexts if "stances" in context]


def tutor_contexts(calls):
    contexts = (json.loads(call["messages"][1]["content"]) for call in calls)
    return [context for context in contexts if "turn_index" in context]


def test_a_stated_position_is_placed_in_the_stance_space(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.extend([HOLDS, REFUSE])
    view = answer(client, attempt["id"], "不能主動害人")
    # The student's view is the tutor's reply; no stance reaches it.
    assert view["messages"][-1]["text"] == HOLDS["reply_text"]
    assert "stances" not in view["scenarios"][0]
    classified = classify_calls(calls)
    assert len(classified) == 1
    assert classified[0]["student_text"] == "不能主動害人"
    assert classified[0]["stances"] == EXPANSION["stances"]
    assert classified[0]["narrative"] == SCENARIO
    stances = transcript(client, s)["scenarios"][0]["stances"]
    assert [(item["stance_id"], item["label"], item["confidence"]) for item in stances] == [
        ("s2", "不拉", "medium")
    ]


def test_a_change_of_mind_is_placed_again_and_the_old_stance_stays(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.extend([HOLDS, REFUSE])
    answer(client, attempt["id"], "不能主動害人")
    # Holding the same position asks for nothing new.
    replies.append(HOLDS)
    answer(client, attempt["id"], "因為是我親手造成的")
    assert len(classify_calls(calls)) == 1
    replies.extend([SHIFTED, PULL])
    answer(client, attempt["id"], "我其實改變想法了，救五個人比較重要")
    later = classify_calls(calls)[-1]
    # Only what the student said since the last placement is classified.
    assert later["student_text"] == "因為是我親手造成的\n我其實改變想法了，救五個人比較重要"
    stances = transcript(client, s)["scenarios"][0]["stances"]
    assert [item["stance_id"] for item in stances] == ["s2", "s1"]
    assert stances[0]["message_id"] != stances[1]["message_id"]


def test_no_position_yet_asks_for_no_placement(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(VAGUE)
    answer(client, attempt["id"], "我不知道")
    assert classify_calls(calls) == []
    assert transcript(client, s)["scenarios"][0]["stances"] == []


def test_an_activity_without_a_stance_space_is_never_classified(client, tutor):
    calls, replies = tutor
    s = setup(client, expansion=False)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(HOLDS)
    answer(client, attempt["id"])
    assert classify_calls(calls) == []
    assert transcript(client, s)["scenarios"][0]["stances"] == []


def test_an_unusable_placement_records_nothing(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    unknown = {**REFUSE, "stance_id": "s9"}
    unclear = {**REFUSE, "stance_id": None, "confidence": "low"}
    replies.extend([HOLDS, unknown, SHIFTED, unclear, SHIFTED, RuntimeError("provider down")])
    for text in ("不能主動害人", "也許吧", "我改變想法了"):
        view = answer(client, attempt["id"], text)
        assert view["state"] == "in_dialogue"
    assert transcript(client, s)["scenarios"][0]["stances"] == []


def test_the_tutor_aims_at_the_activity_goal(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(VAGUE)
    answer(client, attempt["id"], "我不知道")
    assert tutor_contexts(calls)[0]["tutor_goal"] == EXPANSION["tutor_goal"]


def test_each_message_keeps_its_language_and_english_stays_english(client, tutor):
    _, replies = tutor
    s = setup(client, expansion=False, locale="en")
    attempt = ok(start(client, s["activity_id"]))
    replies.append({**OPENING, "reply_text": "What do you mean by actively?"})
    view = answer(client, attempt["id"], "You should not actively harm anyone.")
    student, tutor_message = view["messages"]
    assert (student["text"], student["locale"]) == ("You should not actively harm anyone.", "en")
    assert tutor_message["locale"] is None
    read = transcript(client, s)["messages"]
    assert [(m["role"], m["text"], m["locale"]) for m in read] == [
        ("student", "You should not actively harm anyone.", "en"),
        ("tutor", "What do you mean by actively?", None),
    ]


def test_without_a_chosen_language_the_default_is_kept(client, tutor):
    _, replies = tutor
    s = setup(client, expansion=False)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(VAGUE)
    view = answer(client, attempt["id"], "我不知道")
    assert view["messages"][0]["locale"] == "zh-Hant"

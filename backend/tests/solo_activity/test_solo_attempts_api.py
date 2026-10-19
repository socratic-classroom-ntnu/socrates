"""/api/v2/solo: starting, the single-question flow, privacy, and the provider boundary."""

import asyncio
import json
import time

from sqlalchemy import func, select

from app.modules.llm_runtime.tutor.classroom_provider import ProviderWait
from app.modules.platform.repositories import classroom_storage as storage
from app.modules.solo_dialogue.api.solo_schemas import SubmitStanceBody
from app.modules.solo_dialogue.repositories.solo_models import SoloMessage
from app.modules.solo_dialogue.services import solo_attempts as service
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import act, create_activity, question
from tests.course_management.test_courses_api import create_course

OPENING = {
    "reply_text": "你說不能主動害人，「主動」指的是什麼？",
    # A provider that wrongly reports everything met on turn 0; the floor must hold.
    "observations": {
        "has_position": True,
        "has_reason": True,
        "reason_tested": True,
        "position_shifted": False,
        "principle_label": "義務論",
    },
    "move": "probe",
    "summary": {
        "current_position": "不拉",
        "reason_summary": "不能主動害人",
        "relevant_conditions": [],
        "unresolved_issue": "",
        "principle_note": "",
    },
}
MET = {
    **OPENING,
    "reply_text": "我試著整理你的想法，請你看看對不對。",
    "summary": {
        "current_position": "不拉桿",
        "reason_summary": "主動造成傷害和任其發生不同",
        "relevant_conditions": ["工人不知情"],
        "unresolved_issue": "",
        "principle_note": "",
    },
}
NOT_MET = {**OPENING, "observations": {**OPENING["observations"], "reason_tested": False}}


def configure_ai(client, model="tutor-model"):
    profile = client.post(
        "/api/v2/provider-profiles",
        json={
            "name": "OpenRouter",
            "adapter": "openrouter",
            "default_model": "profile-default",
            "credential": "sk-or-test",
        },
    )
    assert profile.status_code == 200, profile.text
    settings = {
        "default_profile_id": profile.json()["id"],
        "model_matrix": {"socratic_tutor": model},
    }
    assert client.put("/api/v2/ai-settings/account", json=settings).status_code == 200
    return profile.json()["id"]


def join(client, course, name):
    account = user(client, name)
    body = {"code": course["code"], "display_name": name + "同學"}
    assert client.post("/api/v2/courses/join", json=body).status_code == 200
    return account


def setup(client, *, questions=None, ai=True, **activity):
    """Teacher with a published, open activity and one enrolled student (logged in)."""
    teacher = user(client, "owner")
    profile_id = configure_ai(client) if ai else None
    course = create_course(client)
    body = create_activity(client, course["id"], questions=questions or [question()], **activity)
    assert act(client, body["id"], "publish").status_code == 200
    student = join(client, course, "student")
    return {
        "teacher": teacher,
        "course": course,
        "activity_id": body["id"],
        "student": student,
        "profile_id": profile_id,
    }


def start(client, activity_id):
    return client.post(f"/api/v2/solo/activities/{activity_id}/attempt")


def do(client, attempt_id, action, body=None):
    kwargs = {"json": body} if body is not None else {}
    return client.post(f"/api/v2/solo/attempts/{attempt_id}/{action}", **kwargs)


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def stance(client, attempt_id, option_id="o1", reason="不能主動害人"):
    return ok(do(client, attempt_id, "submit_stance", {"option_id": option_id, "reason": reason}))


def tutor_messages() -> int:
    with storage.transaction() as db:
        return db.scalar(
            select(func.count()).select_from(SoloMessage).where(SoloMessage.role == "tutor")
        )


def test_activity_view_shows_own_attempt(client, tutor):
    s = setup(client)
    view = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))
    assert view["attempt"] is None
    assert view["status"] == "open"
    assert view["question_count"] == 1
    assert view["course_name"] == s["course"]["name"]

    attempt = ok(start(client, s["activity_id"]))
    view = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))
    assert view["attempt"] == {
        "id": attempt["id"],
        "state": "choosing_stance",
        "question_index": 0,
        "progress": [
            {"index": 0, "status": "in_dialogue", "title": "岔道上的選擇", "option_label": None}
        ],
        "review_status": "not_started",
        "current_turn": 0,
    }

    switch(client, s["teacher"])
    response = client.get(f"/api/v2/solo/activities/{s['activity_id']}")
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})
    user(client, "stranger")
    response = client.get(f"/api/v2/solo/activities/{s['activity_id']}")
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})


def test_draft_activity_is_not_found(client, tutor):
    user(client, "owner")
    course = create_course(client)
    draft = create_activity(client, course["id"])
    join(client, course, "student")
    for response in (
        client.get(f"/api/v2/solo/activities/{draft['id']}"),
        start(client, draft["id"]),
    ):
        assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})


def test_start_requires_enrollment_and_open_activity(client, tutor):
    s = setup(client)
    switch(client, s["teacher"])
    response = start(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})
    user(client, "stranger")
    response = start(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    switch(client, s["teacher"])
    later = create_activity(
        client,
        s["course"]["id"],
        starts_at=time.time() + 600,
        ends_at=time.time() + 3600,
    )
    assert act(client, later["id"], "publish").status_code == 200
    ended = create_activity(client, s["course"]["id"])
    assert act(client, ended["id"], "publish").status_code == 200
    assert act(client, ended["id"], "end_now").status_code == 200

    switch(client, s["student"])
    for activity_id in (later["id"], ended["id"]):
        response = start(client, activity_id)
        assert (response.status_code, response.json()) == (409, {"detail": "ACTIVITY_NOT_OPEN"})


def test_start_is_idempotent_and_locks_revision(client, tutor):
    s = setup(client)
    first = ok(start(client, s["activity_id"]))
    second = ok(start(client, s["activity_id"]))
    assert first["id"] == second["id"]
    assert first["display_name"] == "student同學"
    assert first["available_actions"] == ["submit_stance"]

    switch(client, s["teacher"])
    cards = ok(client.get(f"/api/v2/courses/{s['course']['id']}/activities"))["items"]
    assert [card["locked"] for card in cards] == [True]


def test_student_message_persisted_before_provider(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    seen_at_call: list[list[str]] = []

    def fail_after_looking():
        # Another connection: only committed rows are visible.
        with storage.transaction() as db:
            seen_at_call.append(list(db.scalars(select(SoloMessage.text))))
        raise ProviderWait("PROVIDER_TIMEOUT", 60)

    replies.append(fail_after_looking)
    view = stance(client, attempt["id"])

    assert seen_at_call == [["不能主動害人"]]
    assert view["state"] == "tutor_unavailable"
    assert view["notice"] == "tutor_unavailable"
    assert view["available_actions"] == ["retry"]
    assert [(m["role"], m["text"]) for m in view["messages"]] == [("student", "不能主動害人")]

    replies.append(OPENING)
    view = ok(do(client, attempt["id"], "retry"))
    assert view["state"] == "in_dialogue"
    assert view["notice"] is None
    assert [m["role"] for m in view["messages"]] == ["student", "tutor"]
    assert len(calls) == 2


def test_concurrent_retry_single_reply(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    with storage.transaction() as db:
        account = db.get(storage.Account, s["student"]["id"])
        body = SubmitStanceBody(option_id="o1", reason="不能主動害人")
        prepared = service.begin_action(
            db, account, attempt["id"], "submit_stance", body, service.now()
        )
    replies.extend([OPENING, OPENING])
    first = asyncio.run(service.finish_action(prepared))
    second = asyncio.run(service.finish_action(prepared))
    assert first["state"] == second["state"] == "in_dialogue"
    assert tutor_messages() == 1


def test_full_single_question_flow(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))

    replies.append(OPENING)
    view = stance(client, attempt["id"])
    assert view["state"] == "in_dialogue"
    assert view["questions"][0]["stance"] == {
        "option_id": "o1",
        "current_option_id": "o1",
        "reason": "不能主動害人",
    }
    assert view["candidate_summary"] is None and view["summary_digest"] is None
    opening_context = json.loads(calls[0]["messages"][1]["content"])
    assert opening_context["turn_index"] == 0
    assert opening_context["history"] == []
    assert opening_context["option_id"] == "o1"
    assert opening_context["option_text"] == "不拉"
    assert opening_context["argument"] == "不能主動害人"
    assert opening_context["question"]["tutor_goal"] == "協助學生照見自己的立場與理由。"

    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    assert view["state"] == "confirming"
    assert view["available_actions"] == ["confirm_viewpoint", "revise_viewpoint"]
    assert view["candidate_summary"] == MET["summary"]
    assert view["principle_hint"] == "義務論"
    second_context = json.loads(calls[1]["messages"][1]["content"])
    assert second_context["turn_index"] == 1
    assert [h["role"] for h in second_context["history"]] == ["tutor", "student"]
    assert "observations" not in json.dumps(view, ensure_ascii=False)

    stale = do(client, attempt["id"], "confirm_viewpoint", {"summary_digest": "0" * 32})
    assert (stale.status_code, stale.json()) == (409, {"detail": "SOLO_SUMMARY_STALE"})

    view = ok(do(client, attempt["id"], "revise_viewpoint"))
    assert view["state"] == "in_dialogue" and view["candidate_summary"] is None
    # The reply right after 不太對 never confirms (test_revise_settle_policy).
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "就算工人不知情也一樣"}))
    assert view["state"] == "in_dialogue"
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "親手造成的就是不一樣"}))
    assert view["state"] == "confirming"

    view = ok(
        do(client, attempt["id"], "confirm_viewpoint", {"summary_digest": view["summary_digest"]})
    )
    assert view["state"] == "reviewing"
    assert view["available_actions"] == ["submit_review"]
    assert view["questions"][0]["status"] == "goal_met"
    assert view["questions"][0]["confirmed_summary"] == MET["summary"]
    assert view["candidate_summary"] is None

    review = do(client, attempt["id"], "submit_review")
    assert (review.status_code, review.json()) == (501, {"detail": "SOLO_STEP_NOT_READY"})

    # Reloading continues from the same place.
    assert ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}")) == view


def test_unavailable_action_and_body_shape(client, tutor):
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    response = do(client, attempt["id"], "send_message", {"text": "太早了"})
    assert (response.status_code, response.json()) == (409, {"detail": "SOLO_ACTION_UNAVAILABLE"})
    assert do(client, attempt["id"], "submit_stance").status_code == 422
    assert do(client, attempt["id"], "submit_stance", {"text": "錯的欄位"}).status_code == 422
    assert do(client, attempt["id"], "retry", {"text": "不該有 body"}).status_code == 422
    assert do(client, attempt["id"], "fly").status_code == 422
    response = do(client, attempt["id"], "submit_stance", {"option_id": "nope", "reason": "x"})
    assert (response.status_code, response.json()) == (422, {"detail": "SOLO_OPTION_INVALID"})


def test_view_hides_unreached_questions(client, tutor):
    _, replies = tutor
    questions = [
        question("q1", "岔道上的選擇"),
        {**question("q2", "天橋上的胖子"), "scenario": "你站在天橋上，旁邊有一位陌生人。"},
        {**question("q3", "器官移植的醫生"), "scenario": "五位病人各自需要不同的器官。"},
    ]
    s = setup(client, questions=questions)
    hidden = ["天橋上的胖子", "你站在天橋上", "器官移植的醫生", "五位病人各自"]

    responses = [
        client.get(f"/api/v2/solo/activities/{s['activity_id']}"),
        start(client, s["activity_id"]),
    ]
    attempt = ok(responses[-1])
    assert attempt["question_count"] == 3
    assert [q["index"] for q in attempt["questions"]] == [0]
    replies.append(OPENING)
    responses.append(
        do(client, attempt["id"], "submit_stance", {"option_id": "o0", "reason": "救五個"})
    )
    responses.append(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))
    for response in responses:
        text = response.content.decode()
        assert response.status_code == 200, text
        assert not [word for word in hidden if word in text]


def test_attempt_is_private_to_its_student(client, tutor):
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    join(client, s["course"], "classmate")
    for who in ("classmate", "teacher"):
        if who == "teacher":
            switch(client, s["teacher"])
        for response in (
            client.get(f"/api/v2/solo/attempts/{attempt['id']}"),
            do(client, attempt["id"], "submit_stance", {"option_id": "o1", "reason": "冒名"}),
        ):
            assert (response.status_code, response.json()) == (
                404,
                {"detail": "SOLO_ATTEMPT_NOT_FOUND"},
            )
    switch(client, s["student"])
    assert ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))["messages"] == []


def test_owner_chain_uses_teacher_profile(client, tutor):
    calls, replies = tutor
    s = setup(client)
    # The student's own settings never route the course's tutor.
    configure_ai(client, model="student-model")
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    (call,) = calls
    assert call["binding"]["profile_id"] == s["profile_id"]
    assert call["binding"]["owner_id"] == s["teacher"]["id"]
    assert call["binding"]["model"] == "tutor-model"
    assert call["binding"]["role"] == "socratic_tutor"
    assert call["schema"].__name__ == "PersonalTutorTurn"


def test_solo_prompt_keeps_summaries_out_of_the_reply(client, tutor):
    """Whether to confirm is the backend's call (policy.py); the tutor's text must not pre-empt it."""
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    system = calls[0]["messages"][0]["content"]
    # The group dialogue's personal_tutor prompt lets the model decide to recap; solo must not.
    assert "請學生檢視摘要" not in system
    assert "reply_text 一律以一個追問結尾" in system
    assert "用「你」" in system
    # A7: the tutor speaks to a classmate, not a customer.
    assert "一律用「你」稱呼學生，不要用「您」" in system


def test_teacher_without_profile_reports_missing_provider(client, tutor):
    calls, _ = tutor
    s = setup(client, ai=False)
    attempt = ok(start(client, s["activity_id"]))
    view = stance(client, attempt["id"])
    assert calls == []
    assert view["state"] == "tutor_unavailable"
    assert view["notice"] == "owner_provider_missing"
    assert view["available_actions"] == ["retry"]
    assert [m["text"] for m in view["messages"]] == ["不能主動害人"]


def test_started_attempt_continues_after_activity_ends(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    switch(client, s["teacher"])
    assert act(client, s["activity_id"], "end_now").status_code == 200
    switch(client, s["student"])
    assert ok(start(client, s["activity_id"]))["id"] == attempt["id"]
    view = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))
    assert view["status"] == "ended" and view["attempt"]["id"] == attempt["id"]
    replies.append(OPENING)
    assert stance(client, attempt["id"])["state"] == "in_dialogue"


def two_questions():
    return [
        question("q1", "岔道上的選擇"),
        {**question("q2", "天橋上的胖子"), "scenario": "你站在天橋上，旁邊有一位陌生人。"},
    ]


def to_confirming(client, attempt_id, replies, option_id="o1"):
    replies.append(OPENING)
    stance(client, attempt_id, option_id=option_id)
    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "因為是我親手造成的"}))
    assert view["state"] == "confirming"
    return view


def confirm(client, attempt_id, view):
    return ok(
        do(client, attempt_id, "confirm_viewpoint", {"summary_digest": view["summary_digest"]})
    )


def test_multi_question_flow(client, tutor):
    calls, replies = tutor
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    view = confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    assert view["state"] == "between_questions"
    assert view["available_actions"] == ["next_question"]
    assert [q["index"] for q in view["questions"]] == [0]
    assert view["questions"][0]["status"] == "goal_met"
    reloaded = client.get(f"/api/v2/solo/attempts/{attempt['id']}").content.decode()
    assert "天橋上的胖子" not in reloaded and "你站在天橋上" not in reloaded

    view = ok(do(client, attempt["id"], "next_question"))
    assert view["state"] == "choosing_stance"
    assert view["question_index"] == 1
    assert view["available_actions"] == ["submit_stance"]
    second = view["questions"][1]
    assert (second["title"], second["scenario"]) == (
        "天橋上的胖子",
        "你站在天橋上，旁邊有一位陌生人。",
    )
    assert second["stance"] is None and second["status"] == "in_progress"
    assert view["questions"][0]["confirmed_summary"] == MET["summary"]
    brief = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))["attempt"]
    assert (brief["question_index"], brief["current_turn"]) == (1, 0)

    replies.append(OPENING)
    view = stance(client, attempt["id"], option_id="o0", reason="推人和拉桿不一樣")
    assert view["state"] == "in_dialogue"
    context = json.loads(calls[-1]["messages"][1]["content"])
    # The second question's dialogue starts over: its own turn count and history.
    assert context["turn_index"] == 0
    assert context["history"] == []
    assert context["question"]["title"] == "天橋上的胖子"
    assert context["argument"] == "推人和拉桿不一樣"
    assert [m["question_index"] for m in view["messages"]] == [0, 0, 0, 0, 1, 1]

    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "推人是親手做的"}))
    assert view["state"] == "confirming"
    view = confirm(client, attempt["id"], view)
    assert view["state"] == "reviewing"
    assert view["available_actions"] == ["submit_review"]


def test_next_question_not_in_last_question(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    view = confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    assert view["state"] == "reviewing"
    assert "next_question" not in view["available_actions"]
    response = do(client, attempt["id"], "next_question")
    assert (response.status_code, response.json()) == (409, {"detail": "SOLO_ACTION_UNAVAILABLE"})
    brief = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))["attempt"]
    assert brief["review_status"] == "in_progress"


def test_activity_view_progress_hides_unreached_titles(client, tutor):
    _, replies = tutor
    s = setup(client, questions=two_questions())
    url = f"/api/v2/solo/activities/{s['activity_id']}"
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    response = client.get(url)
    assert "天橋上的胖子" not in response.content.decode()
    brief = ok(response)["attempt"]
    assert brief["progress"] == [
        {"index": 0, "status": "in_dialogue", "title": "岔道上的選擇", "option_label": None},
        {"index": 1, "status": "not_started", "title": None, "option_label": None},
    ]
    assert brief["current_turn"] == 0

    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    assert ok(client.get(url))["attempt"]["current_turn"] == 1
    confirm(client, attempt["id"], view)
    brief = ok(client.get(url))["attempt"]
    assert brief["progress"][0] == {
        "index": 0,
        "status": "confirmed",
        "title": "岔道上的選擇",
        "option_label": "不拉",
    }
    assert brief["progress"][1]["title"] is None
    assert brief["review_status"] == "not_started"


def test_revise_sets_revising_until_next_message(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    view = to_confirming(client, attempt["id"], replies)
    assert (view["revising"], view["rejected_summary"]) == (False, None)

    view = ok(do(client, attempt["id"], "revise_viewpoint"))
    assert view["revising"] is True
    assert view["rejected_summary"] == MET["summary"]
    assert ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))["revising"] is True

    replies.append(NOT_MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "我是說工人不知情的時候"}))
    assert (view["revising"], view["rejected_summary"]) == (False, None)

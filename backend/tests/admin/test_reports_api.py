"""後台「報表」：QA 在網站上照題單作答，報表從後台紀錄算出評測與語音用量（不另外呼叫模型）。

評測：學生在題單情境的活動裡，依序送出某一題的作答與後續訊息，那一題就算作答過一次；
導師對最後一則學生訊息的回覆、它的 move，以及那則學生訊息上的 flags，用 llm_runtime 的同一套
評分算分（tests/evals/run_evals.py 直接呼叫模型時用的也是這套）。
語音用量：每一場語音對話留下的 llm_call_audit（endpoint solo.voice／solo.voice_confirmation）。
"""

import time

from sqlalchemy import select

from app.modules.ai_providers.repositories import CallAudit
from app.modules.ai_providers.service import record_direct_call_audit
from app.modules.llm_runtime.service import load_eval_cases
from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt
from tests.admin.test_admin_api import make_admin
from tests.course_management.conftest import switch, user
from tests.solo_activity.test_solo_attempts_api import NOT_MET, answer, ok, setup, start

SPEC = load_eval_cases()
CASES = {case["id"]: case for case in SPEC["cases"]}
ZERO = dict.fromkeys(
    (
        "off_topic",
        "malicious_off_topic",
        "danger_tendency",
        "low_effort",
        "gave_reason",
        "used_example",
        "considered_counterpoint",
        "built_on_tutor",
        "asked_question",
        "self_corrected",
    ),
    0,
)


def reply(text, move="probe", **on):
    return {**NOT_MET, "reply_text": text, "move": move, "flags": {**ZERO, **on}}


def eval_activity(client, scenario=SPEC["scenario"]):
    """The QA admin, then a teacher's published activity and a student, who is left logged in."""
    user(client, "qa-admin", account_role="teacher")
    make_admin("qa-admin")
    return setup(client, scenario=scenario)


def as_admin(client):
    switch(client, {"username": "qa-admin"})


def eval_report(client, **query):
    as_admin(client)
    return ok(client.get("/api/v2/admin/reports/eval", params=query))


def voice_report(client, **query):
    return ok(client.get("/api/v2/admin/reports/voice", params=query))


def row(report, case_id):
    return next(item for item in report["cases"] if item["id"] == case_id)


def student_texts(case):
    return [case["answer"], *(m["text"] for m in case.get("history", []) if m["role"] == "student")]


def test_only_admins_read_the_reports(client):
    user(client, "mei", account_role="teacher")
    for path in ("/api/v2/admin/reports/eval", "/api/v2/admin/reports/voice"):
        response = client.get(path)
        assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")


def test_the_report_lists_every_case_to_type_before_anyone_answers(client):
    eval_activity(client)
    report = eval_report(client)
    assert report["scenario"] == SPEC["scenario"]
    assert [item["id"] for item in report["cases"]] == list(CASES)
    first = row(report, "change-push")
    assert first["messages"] == student_texts(CASES["change-push"])
    assert first["runs"] == 0 and first["move"] is None
    assert all(item["count"] == 0 for item in report["totals"])


def test_a_typed_case_is_scored_from_the_recorded_reply(client, tutor):
    _, replies = tutor
    s = eval_activity(client)
    case = CASES["normal-numbers"]
    attempt = ok(start(client, s["activity_id"]))
    replies.append(reply("五個人比較多，為什麼人數決定對錯？", gave_reason=1))
    answer(client, attempt["id"], case["answer"])
    graded = row(eval_report(client), "normal-numbers")
    assert graded["runs"] == 1
    assert (graded["schema"], graded["move"], graded["flags"], graded["language"]) == (1, 1, 1, 1)
    assert graded["check"] is None and graded["leaked"] == 0
    totals = {item["key"]: item for item in eval_report(client)["totals"]}
    assert totals["move"] == {"key": "move", "rate": 1.0, "count": 1}


def test_a_case_with_history_is_graded_on_the_reply_to_its_last_message(client, tutor):
    _, replies = tutor
    s = eval_activity(client)
    case = CASES["off-lunch"]
    first, last = student_texts(case)
    attempt = ok(start(client, s["activity_id"]))
    # The first reply answers only the opening; the case asks the tutor to pull back after the
    # second message, so a reply without a question there fails the check.
    replies.append(reply("你為什麼這樣想？"))
    answer(client, attempt["id"], first)
    replies.append(reply("先不聊午餐。", move="clarify", off_topic=1, asked_question=1))
    answer(client, attempt["id"], last)
    graded = row(eval_report(client), "off-lunch")
    assert graded["runs"] == 1
    assert graded["check"] == 0
    assert graded["flags"] == 1


def test_a_case_not_finished_yet_is_not_counted(client, tutor):
    _, replies = tutor
    s = eval_activity(client)
    first, _ = student_texts(CASES["off-lunch"])
    attempt = ok(start(client, s["activity_id"]))
    replies.append(reply("你為什麼這樣想？"))
    answer(client, attempt["id"], first)
    assert row(eval_report(client), "off-lunch")["runs"] == 0


def test_a_case_typed_in_the_wrong_language_setting_is_noted(client, tutor):
    _, replies = tutor
    s = eval_activity(client)
    case = CASES["lang-en"]
    attempt = ok(start(client, s["activity_id"]))
    replies.append(reply("你說的是什麼意思？"))
    answer(client, attempt["id"], case["answer"])
    graded = row(eval_report(client), "lang-en")
    assert graded["runs"] == 1
    assert graded["language"] == 0
    assert graded["notes"] == ["語言設定是 zh-Hant，這題要先切到 en"]


def test_other_scenarios_and_old_attempts_are_left_out(client, tutor):
    _, replies = tutor
    s = eval_activity(client, scenario="完全不同的情境。")
    case = CASES["normal-numbers"]
    attempt = ok(start(client, s["activity_id"]))
    replies.append(reply("為什麼？", gave_reason=1))
    answer(client, attempt["id"], case["answer"])
    assert row(eval_report(client), "normal-numbers")["runs"] == 0


def test_the_time_range_drops_older_attempts(client, tutor):
    _, replies = tutor
    s = eval_activity(client)
    case = CASES["normal-numbers"]
    attempt = ok(start(client, s["activity_id"]))
    replies.append(reply("為什麼？", gave_reason=1))
    answer(client, attempt["id"], case["answer"])
    with storage.transaction() as db:
        db.get(SoloAttempt, attempt["id"]).created_at = time.time() - 3 * 86400
    assert row(eval_report(client, days=1), "normal-numbers")["runs"] == 0
    assert row(eval_report(client, days=7), "normal-numbers")["runs"] == 1


# ---- 語音用量 ------------------------------------------------------------------------------

GEMINI_USAGE = {
    "promptTokenCount": 1200,
    "responseTokenCount": 800,
    "totalTokenCount": 2000,
    "promptTokensDetails": [
        {"modality": "AUDIO", "tokenCount": 1000},
        {"modality": "TEXT", "tokenCount": 200},
    ],
    "responseTokensDetails": [{"modality": "AUDIO", "tokenCount": 800}],
}


def voice_call(account_id, endpoint="solo.voice", usage=GEMINI_USAGE):
    record_direct_call_audit(
        actor_id=account_id,
        endpoint=endpoint,
        role="voice",
        binding={"adapter": "gemini_live", "model": "voice-model"},
        state="READY",
        audit={"token_usage": usage},
    )


def admin_id(client):
    user(client, "qa-admin", account_role="teacher")
    make_admin("qa-admin")
    return client.get("/api/v2/auth/me").json()["id"]


def test_each_voice_session_is_a_row_with_its_tokens(client):
    account_id = admin_id(client)
    voice_call(account_id)
    voice_call(account_id, endpoint="solo.tutor")
    report = voice_report(client)
    assert report["costed"] is False
    [session] = report["sessions"]
    assert session["username"] == "qa-admin"
    assert (session["endpoint"], session["model"]) == ("solo.voice", "voice-model")
    assert (session["input_tokens"], session["output_tokens"]) == (1200, 800)
    assert (session["audio_input_tokens"], session["audio_output_tokens"]) == (1000, 800)
    assert session["cost"] is None
    assert report["totals"] == {
        "sessions": 1,
        "input_tokens": 1200,
        "output_tokens": 800,
        "cost": None,
    }


def test_voice_cost_uses_the_configured_rates(client, monkeypatch):
    monkeypatch.setenv("VOICE_INPUT_COST_PER_MILLION", "3")
    monkeypatch.setenv("VOICE_OUTPUT_COST_PER_MILLION", "12")
    account_id = admin_id(client)
    voice_call(account_id)
    voice_call(account_id)
    report = voice_report(client)
    assert report["costed"] is True
    # (1200 × 3 + 800 × 12) ÷ 1,000,000 per session
    assert [s["cost"] for s in report["sessions"]] == [0.0132, 0.0132]
    assert report["totals"]["cost"] == 0.0264


def test_the_confirmation_judge_is_listed_with_its_own_recorded_cost(client, monkeypatch):
    monkeypatch.setenv("VOICE_INPUT_COST_PER_MILLION", "3")
    monkeypatch.setenv("VOICE_OUTPUT_COST_PER_MILLION", "12")
    account_id = admin_id(client)
    voice_call(account_id, endpoint="solo.voice_confirmation", usage={"prompt_tokens": 50})
    [session] = voice_report(client)["sessions"]
    assert session["endpoint"] == "solo.voice_confirmation"
    assert (session["input_tokens"], session["output_tokens"], session["cost"]) == (50, 0, None)


def test_the_voice_time_range_drops_older_sessions(client):
    account_id = admin_id(client)
    voice_call(account_id)
    with storage.transaction() as db:
        for audit in db.scalars(select(CallAudit)):
            audit.created_at = time.time() - 3 * 86400
    assert voice_report(client, days=1)["sessions"] == []
    assert len(voice_report(client, days=7)["sessions"]) == 1

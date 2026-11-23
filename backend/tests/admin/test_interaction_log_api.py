"""後台「分析紀錄」：每一個改變狀態的請求與每一次模型回覆都側錄下來，去識別化（platform/
interaction_log.py），管理員在後台看摘要、下載完整紀錄。"""

import json
import time

from sqlalchemy import select

from app.modules.identity_access.repositories import Account
from app.modules.platform import interaction_log
from app.modules.platform import storage as storage
from app.modules.platform.repositories import InteractionEvent
from tests.admin.test_admin_api import make_admin
from tests.course_management.conftest import PASSWORD, switch, user
from tests.solo_activity.test_solo_attempts_api import NOT_MET, answer, ok, setup, start


def events(kind=None):
    with storage.transaction() as db:
        query = select(InteractionEvent).order_by(InteractionEvent.id)
        if kind:
            query = query.where(InteractionEvent.kind == kind)
        return [
            {
                "kind": e.kind,
                "name": e.name,
                "subject": e.subject,
                "outcome": e.outcome,
                "data": e.data,
            }
            for e in db.scalars(query)
        ]


def account_id(username):
    with storage.transaction() as db:
        return db.scalar(select(Account.id).where(Account.username == username))


def as_admin(client):
    user(client, "qa-admin", account_role="teacher")
    make_admin("qa-admin")


def test_a_students_message_is_recorded_under_a_hash_of_the_account(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"], "不能主動害人")
    [sent] = [
        e for e in events("request") if e["name"].endswith("/solo/attempts/{attempt_id}/{action}")
    ]
    assert sent["name"] == "POST /api/v2/solo/attempts/{attempt_id}/{action}"
    assert sent["outcome"] == "200"
    assert sent["data"]["path_params"] == {"attempt_id": attempt["id"], "action": "send_message"}
    assert sent["data"]["body"] == {"text": "不能主動害人"}
    student = account_id("student")
    assert sent["subject"] == interaction_log.pseudonym(student)
    assert len(sent["subject"]) == 24 and student not in json.dumps(events(), ensure_ascii=False)


def test_each_model_call_is_recorded_with_its_whole_response(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"], "不能主動害人")
    [call] = [e for e in events("model") if e["name"] == "solo_tutor"]
    assert call["outcome"] == "pass"
    assert call["data"]["result"]["reply_text"] == NOT_MET["reply_text"]
    assert call["data"]["context"]["answer"] == "不能主動害人"
    assert call["data"]["iron_rules"]["outcome"] == "pass"
    assert call["subject"] == interaction_log.pseudonym(account_id("student"))


def test_a_failed_model_call_is_recorded_with_its_reason(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(RuntimeError("provider down"))
    client.post(
        f"/api/v2/solo/attempts/{attempt['id']}/send_message", json={"text": "不能主動害人"}
    )
    [call] = [e for e in events("model") if e["name"] == "solo_tutor"]
    assert call["outcome"] == "error:RuntimeError"
    assert call["data"]["result"] is None


def test_passwords_names_and_sign_in_bodies_are_never_kept(client):
    user(client, "mei", account_role="teacher")
    text = json.dumps(events(), ensure_ascii=False)
    assert PASSWORD not in text and "mei@example.org" not in text
    login = [e for e in events("request") if e["name"] == "POST /api/v2/auth/login"]
    assert login and all(e["data"]["body"] is None for e in login)
    assert interaction_log.scrub(
        {"display_name": "小美", "nested": [{"password": "x", "text": "留下"}]}
    ) == {"display_name": "•••", "nested": [{"password": "•••", "text": "留下"}]}


def test_reading_is_not_recorded(client):
    user(client, "mei", account_role="teacher")
    before = len(events())
    assert client.get("/api/v2/auth/me").status_code == 200
    assert len(events()) == before


def test_turning_the_switch_off_stops_recording(client):
    as_admin(client)
    off = client.put("/api/v2/admin/toggles/interaction_log", json={"enabled": False})
    assert off.status_code == 200, off.text
    before = len(events())
    client.post("/api/v2/auth/logout")
    switch(client, {"username": "qa-admin"})
    assert len(events()) == before
    view = ok(client.get("/api/v2/admin/interaction-log"))
    assert view["enabled"] is False


def test_admins_read_the_summary_and_download_every_record(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"], "不能主動害人")
    as_admin(client)
    view = ok(client.get("/api/v2/admin/interaction-log"))
    assert view["enabled"] is True and view["total"] == len(events())
    # The teacher and the student; the admin has only signed in so far.
    assert view["subjects"] == 2
    names = {(row["kind"], row["name"]): row["count"] for row in view["counts"]}
    assert names[("model", "solo_tutor")] == 1
    assert names[("request", "POST /api/v2/solo/attempts/{attempt_id}/{action}")] == 1
    export = ok(client.get("/api/v2/admin/interaction-log/export", params={"days": 1}))
    lines = export["records"]
    assert export["days"] == 1 and len(lines) == view["total"]
    assert [line["at"] for line in lines] == sorted(line["at"] for line in lines)
    assert any(line["kind"] == "model" and line["data"]["result"] for line in lines)


def test_the_range_drops_older_records(client):
    as_admin(client)
    with storage.transaction() as db:
        for event in db.scalars(select(InteractionEvent)):
            event.at = time.time() - 3 * 86400
    assert ok(client.get("/api/v2/admin/interaction-log", params={"days": 1}))["total"] == 0
    assert ok(client.get("/api/v2/admin/interaction-log", params={"days": 7}))["total"] > 0


def test_only_admins_reach_the_records(client):
    user(client, "mei", account_role="teacher")
    for path in ("/api/v2/admin/interaction-log", "/api/v2/admin/interaction-log/export"):
        response = client.get(path)
        assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")

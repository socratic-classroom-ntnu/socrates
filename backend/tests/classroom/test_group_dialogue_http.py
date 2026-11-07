"""group-dialogue 端點的 HTTP 層測試：用 TestClient 打真的路由，讀回狀態碼與 response_model 的欄位。"""

import uuid
from app.modules.platform import storage as storage
from app.modules.identity_access.repositories import Account
from app.modules.group_dialogue.repositories import AIStudentProfile
from tests.classroom.test_api import DOC, client, cmd, user  # noqa: F401
from tests.classroom.test_script_assist import login


def open_room(c):
    script = c.post("/api/v2/scripts", json={"document": DOC}).json()
    room = c.post("/api/v2/classrooms", json={"script_id": script["id"]})
    assert room.status_code == 200
    return room.json()


def join(c, room, name):
    login(c, name)
    r = c.post("/api/v2/classrooms/join", json={"code": room["code"], "alias": name})
    assert r.status_code == 200
    return r.json()["member_id"]


def identity(c, room, member_id):
    return c.get(f"/api/v2/groups/runs/{room['id']}/members/{member_id}/identity")


def test_identity_reveals_username_to_teacher_only(client):  # noqa: F811
    user(client)
    room = open_room(client)
    member = join(client, room, "student")
    student = identity(client, room, member)
    assert (student.status_code, student.json()) == (403, {"detail": "TEACHER_MEMBERSHIP_REQUIRED"})
    login(client, "teacher")
    r = identity(client, room, member)
    assert (r.status_code, r.json()) == (
        200,
        {"username": "student", "scope": "teacher_hover_only"},
    )
    missing = identity(client, room, "no-such-member")
    assert (missing.status_code, missing.json()) == (404, {"detail": "GROUP_MEMBER_REQUIRED"})


def add_ai(c, room, count=2, action_id=None):
    body = {"action_id": action_id or str(uuid.uuid4()), "count": count}
    return c.post(f"/api/v2/groups/classrooms/{room['id']}/ai-students", json=body)


def clear_ai(c, room, action_id=None):
    body = {"action_id": action_id or str(uuid.uuid4())}
    return c.post(f"/api/v2/groups/classrooms/{room['id']}/ai-students/clear", json=body)


def roster(c, room):
    view = c.get(f"/api/v2/groups/classrooms/{room['id']}", params={"mode": "teacher"}).json()
    return view["roster"], view["roster_digest"]


def test_add_ai_students_joins_them_to_the_lobby_roster(client):  # noqa: F811
    user(client)
    room = open_room(client)
    action_id = str(uuid.uuid4())
    r = add_ai(client, room, 2, action_id)
    assert r.status_code == 200
    receipt = r.json()
    assert (receipt["status"], receipt["action_id"], receipt["room_id"]) == (
        "RECORDED",
        action_id,
        room["id"],
    )
    assert len(receipt["created"]) == 2
    for created in receipt["created"]:
        assert set(created) == {
            "account_id",
            "membership_id",
            "alias",
            "persona_id",
            "model",
            "provider_profile_id",
        }
        assert created["alias"].endswith(" · AI")
        assert (created["model"], created["provider_profile_id"]) == ("openrouter/free", None)
    rows, digest = roster(client, room)
    assert receipt["roster_digest"] == digest
    assert {row["id"] for row in rows} == {c["membership_id"] for c in receipt["created"]}
    assert {row["actor_type"] for row in rows} == {"llm_student"}
    # 重送同一個 action_id 不會再加人；同 id 換內容是衝突
    assert add_ai(client, room, 2, action_id).json() == receipt
    assert len(roster(client, room)[0]) == 2
    conflict = add_ai(client, room, 3, action_id)
    assert (conflict.status_code, conflict.json()) == (
        409,
        {"detail": "ACTION_ID_PAYLOAD_CONFLICT"},
    )


def test_clear_ai_students_removes_only_ai_members(client):  # noqa: F811
    user(client)
    room = open_room(client)
    human = join(client, room, "student")
    login(client, "teacher")
    created = add_ai(client, room, 3).json()["created"]
    r = clear_ai(client, room)
    assert r.status_code == 200
    receipt = r.json()
    assert (receipt["status"], receipt["removed"], receipt["room_id"]) == (
        "RECORDED",
        3,
        room["id"],
    )
    rows, digest = roster(client, room)
    assert receipt["roster_digest"] == digest
    assert [row["id"] for row in rows] == [human]
    with storage.transaction() as db:
        ai_accounts = [c["account_id"] for c in created]
        assert db.query(AIStudentProfile).count() == 0
        assert all(db.get(Account, account_id) is None for account_id in ai_accounts)


def test_ai_students_require_teacher_lobby_and_enabled_feature(client, monkeypatch):  # noqa: F811
    user(client)
    room = open_room(client)
    join(client, room, "student")
    for r in (add_ai(client, room), clear_ai(client, room)):
        assert (r.status_code, r.json()) == (403, {"detail": "TEACHER_MEMBERSHIP_REQUIRED"})
    login(client, "teacher")
    monkeypatch.setenv("SOCRATES_FEATURE_AI_STUDENTS", "false")
    for r in (add_ai(client, room), clear_ai(client, room)):
        assert (r.status_code, r.json()) == (409, {"detail": "AI_STUDENTS_DISABLED"})
    monkeypatch.delenv("SOCRATES_FEATURE_AI_STUDENTS")
    assert cmd(client, room, "start").status_code == 200
    for r in (add_ai(client, room), clear_ai(client, room)):
        assert (r.status_code, r.json()) == (409, {"detail": "LOBBY_REQUIRED"})


SUGGESTION = {"question_id": "q", "title": "題目", "scenario": "抉擇", "existing_options": ["甲"]}


def test_other_suggestion_without_provider_uses_fixed_suggestion(client):  # noqa: F811
    # 沒有設定 provider profile 時不呼叫模型，回固定內容；同樣的輸入拿到同一個 suggestion_id
    user(client)
    r = client.post("/api/v2/suggestions/other", json=SUGGESTION)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "suggestion_text",
        "suggestion_id",
        "suggestion_model",
        "suggestion_provider",
        "provider_profile_id",
        "classroom_owner_id",
    }
    assert body["suggestion_text"]
    assert body["suggestion_id"].startswith("fallback-")
    assert (body["suggestion_model"], body["suggestion_provider"]) == (
        None,
        "deterministic-ai-suggestion",
    )
    again = client.post("/api/v2/suggestions/other", json=SUGGESTION).json()
    assert again["suggestion_id"] == body["suggestion_id"]


def test_other_suggestion_rejects_rooms_the_caller_is_not_in(client):  # noqa: F811
    user(client)
    room = open_room(client)
    login(client, "outsider")
    r = client.post("/api/v2/suggestions/other", json={**SUGGESTION, "room_id": room["id"]})
    assert (r.status_code, r.json()) == (403, {"detail": "CLASSROOM_MEMBERSHIP_REQUIRED"})
    blank = client.post("/api/v2/suggestions/other", json={**SUGGESTION, "title": " "})
    assert blank.status_code == 422

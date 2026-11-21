"""classroom-core 端點的 HTTP 層測試：用 TestClient 打真的路由，讀回狀態碼與 response_model 的欄位。"""

import uuid
from sqlalchemy import select
from app.modules.platform import storage as storage
from app.modules.classroom_core import runtime
from app.modules.classroom_core.orchestrator import GameOrchestrator
from app.modules.classroom_core.repositories import Event, Room, append_event, persist_machine
from app.modules.content_authoring.repositories import Script
from tests.classroom.test_api import DOC, client, cmd, user  # noqa: F401
from tests.classroom.test_script_assist import login


def open_room(c):
    script = c.post("/api/v2/scripts", json={"document": DOC}).json()
    room = c.post("/api/v2/classrooms", json={"script_id": script["id"]})
    assert room.status_code == 200
    return script["id"], room.json()


def join(c, room, name):
    login(c, name)
    r = c.post("/api/v2/classrooms/join", json={"code": room["code"], "alias": name})
    assert r.status_code == 200
    return r.json()["member_id"]


def fast_forward(room_id):
    # 與 runtime.tick_due 同一套步驟，只把時鐘撥到計時器到期之後，測試不必真的等 countdown。
    with storage.transaction() as db:
        room = db.get(Room, room_id)
        machine = GameOrchestrator(runtime.hydrate(db, room), room.state["due_at"] + 0.2)
        machine.tick()
        persist_machine(db, room, machine)


def started(c):
    user(c)
    script_id, room = open_room(c)
    speaker = join(c, room, "speaker")
    join(c, room, "fan")
    login(c, "teacher")
    assert cmd(c, room, "start").status_code == 200
    return script_id, room, speaker


def focused(c):
    """老師開課 → 兩位學生作答 → 進入 speaker 的聚焦討論。fan 是可以送反應的另一位學生。"""
    _, room, speaker = started(c)
    fast_forward(room["id"])
    for name, option in [("speaker", "a"), ("fan", "b")]:
        login(c, name)
        run_id = c.get("/api/v2/classrooms/" + room["id"]).json()["question_run_id"]
        data = {"question_run_id": run_id, "option_id": option, "text": name + "的理由"}
        assert cmd(c, room, "answer", data).status_code == 200
    login(c, "teacher")
    assert cmd(c, room, "next").status_code == 200  # 提早收卷
    fast_forward(room["id"])
    assert cmd(c, room, "next").status_code == 200  # 分布 → 第一個代表
    login(c, "fan")
    view = c.get("/api/v2/classrooms/" + room["id"]).json()
    assert view["phase"] == "focus"
    assert view["focus"]["member_id"] == speaker
    return room, speaker, view


def react(c, room, focus, action_id=None, **changes):
    body = {
        "action_id": action_id or str(uuid.uuid4()),
        "kind": "heart",
        "focus_id": focus["id"],
        "turn_index": focus["turn_index"],
        **changes,
    }
    return c.post("/api/v2/classrooms/" + room["id"] + "/reactions", json=body)


def points(c, room):
    members = c.get("/api/v2/classrooms/" + room["id"]).json()["members"]
    return {m["id"]: m["points"] for m in members}


def test_reaction_records_points_for_both_sides(client):  # noqa: F811
    room, speaker, view = focused(client)
    fan = view["member_id"]
    action_id = str(uuid.uuid4())
    r = react(client, room, view["focus"], action_id)
    assert r.status_code == 200
    receipt = r.json()
    assert receipt == {
        "status": "RECORDED",
        "action_id": action_id,
        "seq": receipt["seq"],
        "room_id": None,
    }
    assert receipt["seq"] == client.get("/api/v2/classrooms/" + room["id"]).json()["seq"]
    assert points(client, room) == {speaker: 5, fan: 1}
    # 重送同一個 action_id 不重複計分；同 id 換內容是衝突
    assert react(client, room, view["focus"], action_id).json() == receipt
    assert points(client, room) == {speaker: 5, fan: 1}
    conflict = react(client, room, view["focus"], action_id, kind="like")
    assert (conflict.status_code, conflict.json()) == (
        409,
        {"detail": "ACTION_ID_PAYLOAD_CONFLICT"},
    )


def test_reaction_rejects_wrong_focus_self_and_teacher(client):  # noqa: F811
    room, _, view = focused(client)
    stale = react(client, room, view["focus"], turn_index=view["focus"]["turn_index"] + 1)
    assert (stale.status_code, stale.json()) == (409, {"detail": "FOCUS_ID_REQUIRED"})
    login(client, "speaker")
    assert react(client, room, view["focus"]).status_code == 422
    login(client, "teacher")
    teacher = react(client, room, view["focus"])
    assert (teacher.status_code, teacher.json()) == (403, {"detail": "STUDENT_MEMBERSHIP_REQUIRED"})


def test_reaction_outside_focus_is_rejected(client):  # noqa: F811
    user(client)
    _, room = open_room(client)
    join(client, room, "fan")
    r = react(client, room, {"id": "no-focus", "turn_index": 0})
    assert (r.status_code, r.json()) == (409, {"detail": "FOCUS_REQUIRED"})


def test_events_page_in_order_and_after_cursor(client):  # noqa: F811
    user(client)
    _, room = open_room(client)
    member = join(client, room, "student")
    page = client.get("/api/v2/classrooms/" + room["id"] + "/events")
    assert page.status_code == 200
    body = page.json()
    assert [e["type"] for e in body["events"]] == ["classroom.created", "member.joined"]
    assert body["events"][1]["payload"] == {"member_id": member}
    assert [e["seq"] for e in body["events"]] == [1, 2]
    assert (body["latest_seq"], body["more"]) == (2, False)
    after = client.get("/api/v2/classrooms/" + room["id"] + "/events", params={"after": 1}).json()
    assert [e["seq"] for e in after["events"]] == [2]
    assert client.get(
        "/api/v2/classrooms/" + room["id"] + "/events", params={"after": 2}
    ).json() == {"events": [], "latest_seq": 2, "more": False}


def test_events_require_room_membership(client):  # noqa: F811
    user(client)
    _, room = open_room(client)
    login(client, "outsider")
    r = client.get("/api/v2/classrooms/" + room["id"] + "/events")
    assert (r.status_code, r.json()) == (403, {"detail": "CLASSROOM_MEMBERSHIP_REQUIRED"})


def test_events_page_reports_more_when_over_page_size(client):  # noqa: F811
    user(client)
    _, room = open_room(client)
    with storage.transaction() as db:
        row = db.get(Room, room["id"])
        for _ in range(500):
            append_event(db, row, {"type": "barrage", "payload": {"text": "x"}})
    body = client.get("/api/v2/classrooms/" + room["id"] + "/events").json()
    assert (len(body["events"]), body["latest_seq"], body["more"]) == (500, 501, True)
    assert body["events"][-1]["seq"] == 500


def budget(c, room, value):
    return c.post(
        "/api/v2/classrooms/" + room["id"] + "/budget", params={"live_llm_call_budget": value}
    )


def test_budget_update_after_start_returns_view_and_event(client):  # noqa: F811
    _, room, _ = started(client)
    r = budget(client, room, 7)
    assert (r.status_code, r.json()) == (200, {"live_llm_call_budget": 7, "used": 0})
    with storage.transaction() as db:
        assert db.get(Room, room["id"]).state["script"]["live_llm_call_budget"] == 7
        latest = db.scalars(
            select(Event).where(Event.room_id == room["id"]).order_by(Event.seq.desc())
        ).first()
    assert (latest.type, latest.payload) == ("budget.updated", {"live_llm_call_budget": 7})


def test_budget_rejects_range_lobby_and_students(client):  # noqa: F811
    user(client)
    _, room = open_room(client)
    for value in (-1, 100001):
        r = budget(client, room, value)
        assert (r.status_code, r.json()) == (422, {"detail": "BUDGET_RANGE"})
    lobby = budget(client, room, 7)
    assert (lobby.status_code, lobby.json()) == (409, {"detail": "STARTED_CLASSROOM_REQUIRED"})
    join(client, room, "student")
    student = budget(client, room, 7)
    assert (student.status_code, student.json()) == (403, {"detail": "TEACHER_MEMBERSHIP_REQUIRED"})


def adopt(c, script_id, room, index):
    return c.post(f"/api/v2/scripts/{script_id}/adopt-question/{room['id']}/{index}")


def test_adopt_question_appends_run_question_to_owner_script(client):  # noqa: F811
    script_id, room, _ = started(client)
    with storage.transaction() as db:
        revision = db.get(Script, script_id).revision
    r = adopt(client, script_id, room, 0)
    assert (r.status_code, r.json()) == (200, {"id": script_id, "revision": revision + 1})
    with storage.transaction() as db:
        questions = db.get(Script, script_id).document["questions"]
    assert [q["title"] for q in questions] == ["題目", "題目"]
    assert questions[1]["id"].startswith("adopted-")


def test_adopt_question_rejects_missing_question_and_non_owner(client):  # noqa: F811
    script_id, room, _ = started(client)
    missing = adopt(client, script_id, room, 1)
    assert (missing.status_code, missing.json()) == (404, {"detail": "QUESTION_REQUIRED"})
    login(client, "fan")
    student = adopt(client, script_id, room, 0)
    assert (student.status_code, student.json()) == (403, {"detail": "SCRIPT_OWNER_REQUIRED"})

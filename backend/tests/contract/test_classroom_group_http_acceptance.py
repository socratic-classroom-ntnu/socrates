"""HTTP acceptance for the eight previously unexercised strict classroom responses.

All requests pass through FastAPI TestClient and the test-only storage fixture.
External LLM generation alone is replaced by a deterministic boundary stub.
"""

# The imported client name provides a pytest fixture for the test parameters.
# ruff: noqa: F811
from copy import deepcopy
from time import time
from uuid import uuid4

from sqlalchemy import select

from app.modules.classroom_core.orchestrator import GameOrchestrator
from app.modules.classroom_core.repositories import Membership, Room
from app.modules.group_dialogue.routes import ai_students as ai_routes
from app.modules.group_dialogue.service import fallback_other_suggestion
from app.modules.platform import storage
from tests.classroom.test_api import DOC, client, cmd, create, user  # noqa: F401


def _ok(response):
    assert response.status_code == 200, (
        f"{response.request.method} {response.request.url}: "
        f"{response.status_code} {response.text[:400]}"
    )
    return response.json()


def _teacher(client):
    user(client, "teacher")
    return create(client)


def _switch_to_user(client, name):
    login = _ok(
        client.post(
            "/api/v2/auth/login",
            json={"login": name, "password": "Socratic-123456"},
        )
    )
    client.headers["X-CSRF-Token"] = login["csrf_token"]


def _switch_to_teacher(client):
    _switch_to_user(client, "teacher")


def _add_ai(client, room_id):
    return _ok(
        client.post(
            f"/api/v2/groups/classrooms/{room_id}/ai-students",
            json={"action_id": uuid4().hex, "count": 1, "model": "fixture"},
        )
    )


def test_events_get_returns_strict_http_schema(client):
    room = _teacher(client)
    result = _ok(client.get(f"/api/v2/classrooms/{room['id']}/events"))
    assert set(result) == {"events", "latest_seq", "more"}
    assert isinstance(result["events"], list)
    assert isinstance(result["latest_seq"], int)


def test_adjust_budget_returns_strict_http_schema(client):
    room = _teacher(client)
    user(client, "student")
    _ok(
        client.post(
            "/api/v2/classrooms/join",
            json={"code": room["code"], "alias": "學生"},
        )
    )
    _switch_to_teacher(client)
    _ok(cmd(client, room, "start"))
    result = _ok(
        client.post(
            f"/api/v2/classrooms/{room['id']}/budget",
            params={"live_llm_call_budget": 12},
        )
    )
    assert result["live_llm_call_budget"] == 12
    assert set(result) == {"live_llm_call_budget", "used"}


def test_adopt_question_returns_script_revision_http(client):
    user(client, "teacher")
    script = _ok(client.post("/api/v2/scripts", json={"document": DOC}))
    room = _ok(client.post("/api/v2/classrooms", json={"script_id": script["id"]}))
    user(client, "student")
    _ok(
        client.post(
            "/api/v2/classrooms/join",
            json={"code": room["code"], "alias": "學生"},
        )
    )
    _switch_to_teacher(client)
    _ok(cmd(client, room, "start"))
    result = _ok(client.post(f"/api/v2/scripts/{script['id']}/adopt-question/{room['id']}/0"))
    assert result["id"] == script["id"]
    assert result["revision"] > script["revision"]
    assert set(result) == {"id", "revision"}


def test_reaction_routes_to_runtime_and_serializes_actual_receipt(client):
    room = _teacher(client)
    user(client, "target")
    _ok(
        client.post(
            "/api/v2/classrooms/join",
            json={"code": room["code"], "alias": "target"},
        )
    )
    user(client, "sender")
    _ok(
        client.post(
            "/api/v2/classrooms/join",
            json={"code": room["code"], "alias": "sender"},
        )
    )
    _switch_to_teacher(client)
    _ok(cmd(client, room, "start"))
    _switch_to_user(client, "sender")
    with storage.transaction() as db:
        stored = db.get(Room, room["id"])
        members = db.scalars(select(Membership).where(Membership.room_id == room["id"])).all()
        receiver = next(row for row in members if row.alias == "target")
        machine = GameOrchestrator(deepcopy(stored.state), time())
        machine.start_question()
        state = machine.s
        state["phase"] = "focus"
        state["question_index"] = 0
        state["focus"] = "focus-http-coverage"
        state["questions"][0]["sender_point_cap"] = 5
        state["questions"][0]["receiver_point_cap"] = 25
        assert state["runs"], "The production question start must materialize a run"
        # Preserve the production-generated run id for persistence.
        state["runs"][0]["focuses"] = [
            {
                "id": "focus-http-coverage",
                "turn_index": 0,
                "member_id": receiver.id,
                "messages": [],
            }
        ]
        stored.state = state
    result = _ok(
        client.post(
            f"/api/v2/classrooms/{room['id']}/reactions",
            json={
                "action_id": uuid4().hex,
                "kind": "heart",
                "focus_id": "focus-http-coverage",
                "turn_index": 0,
            },
        )
    )
    assert result["status"] == "RECORDED"
    assert set(result) == {"status", "action_id", "seq", "room_id"}


def test_group_member_identity_returns_teacher_only_http_response(client):
    room = _teacher(client)
    user(client, "student")
    _ok(
        client.post(
            "/api/v2/classrooms/join",
            json={"code": room["code"], "alias": "學生"},
        )
    )
    _switch_to_teacher(client)
    group = _ok(
        client.get(
            f"/api/v2/groups/classrooms/{room['id']}",
            params={"mode": "teacher"},
        )
    )
    digest = group["roster_digest"]
    _ok(
        client.post(
            f"/api/v2/groups/classrooms/{room['id']}/configure",
            json={
                "action_id": uuid4().hex,
                "expected_roster_digest": digest,
                "group_count": 1,
                "members_per_group": 1,
            },
        )
    )
    start = _ok(
        client.post(
            f"/api/v2/groups/classrooms/{room['id']}/start",
            json={"action_id": uuid4().hex, "expected_roster_digest": digest},
        )
    )
    group_id = start["groups"][0]["id"]
    with storage.transaction() as db:
        member = db.scalar(
            select(Membership).where(
                Membership.room_id == group_id,
                Membership.role == "student",
            )
        )
        assert member is not None
        member_id = member.id
    result = _ok(client.get(f"/api/v2/groups/runs/{group_id}/members/{member_id}/identity"))
    assert result == {"username": "student", "scope": "teacher_hover_only"}
    user(client, "another_teacher")
    other_room = create(client)
    assert other_room["id"] != room["id"]
    cross_class = client.get(f"/api/v2/groups/runs/{group_id}/members/{member_id}/identity")
    assert cross_class.status_code == 403
    _switch_to_user(client, "student")
    student_request = client.get(f"/api/v2/groups/runs/{group_id}/members/{member_id}/identity")
    assert student_request.status_code == 403


def test_add_ai_students_returns_strict_http_receipt(client, monkeypatch):
    monkeypatch.setenv("SOCRATES_FEATURE_AI_STUDENTS", "true")
    room = _teacher(client)
    result = _add_ai(client, room["id"])
    assert result["room_id"] == room["id"]
    assert len(result["created"]) == 1
    assert result["created"][0]["membership_id"]
    assert set(result) == {"status", "action_id", "seq", "room_id", "roster_digest", "created"}


def test_clear_ai_students_returns_strict_http_receipt(client, monkeypatch):
    monkeypatch.setenv("SOCRATES_FEATURE_AI_STUDENTS", "true")
    room = _teacher(client)
    _add_ai(client, room["id"])
    result = _ok(
        client.post(
            f"/api/v2/groups/classrooms/{room['id']}/ai-students/clear",
            json={"action_id": uuid4().hex},
        )
    )
    assert result["removed"] == 1
    assert result["room_id"] == room["id"]
    assert set(result) == {"status", "action_id", "seq", "room_id", "roster_digest", "removed"}


def test_ai_human_clear_ai_readd_preserves_unique_monotonic_seats(client, monkeypatch):
    monkeypatch.setenv("SOCRATES_FEATURE_AI_STUDENTS", "true")
    room = _teacher(client)
    first = _add_ai(client, room["id"])
    user(client, "student")
    _ok(
        client.post(
            "/api/v2/classrooms/join",
            json={"code": room["code"], "alias": "學生"},
        )
    )
    _switch_to_teacher(client)
    cleared = _ok(
        client.post(
            f"/api/v2/groups/classrooms/{room['id']}/ai-students/clear",
            json={"action_id": uuid4().hex},
        )
    )
    assert cleared["removed"] == 1
    second = _add_ai(client, room["id"])
    with storage.transaction() as db:
        remaining = db.scalars(
            select(Membership).where(
                Membership.room_id == room["id"],
                Membership.role == "student",
            )
        ).all()
        seats = [row.seat for row in remaining]
        assert len(remaining) == 2
        assert len(set(seats)) == len(seats)
        new_ai_id = second["created"][0]["membership_id"]
        new_ai = next(row for row in remaining if row.id == new_ai_id)
        human = next(row for row in remaining if row.id != new_ai_id)
        assert new_ai.seat > human.seat
        assert second["created"][0]["membership_id"] != first["created"][0]["membership_id"]


def test_other_suggestion_returns_strict_http_response(client, monkeypatch):
    _teacher(client)

    async def deterministic_response(actor, session, body):
        return fallback_other_suggestion(body)

    monkeypatch.setattr(ai_routes, "suggest_other_option", deterministic_response)
    result = _ok(
        client.post(
            "/api/v2/suggestions/other",
            json={
                "question_id": "q",
                "title": "觀點",
                "scenario": "應先保障哪一個價值？",
                "existing_options": ["公平", "效率"],
            },
        )
    )
    assert result["suggestion_text"]
    assert result["suggestion_id"].startswith("fallback-")
    assert result["suggestion_provider"] == "deterministic-ai-suggestion"
    assert set(result) == {
        "suggestion_text",
        "suggestion_id",
        "suggestion_model",
        "suggestion_provider",
        "provider_profile_id",
        "classroom_owner_id",
    }

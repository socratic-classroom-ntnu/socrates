"""Native Run2 integration tests using its SQLite unit-test adapter.
Authentication transport is covered by the native existing suite; actor selection
is injected here to exercise real models, ownership checks and transactions.
"""

from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4
import time
import pytest
from starlette.requests import Request
from sqlalchemy import select
from app.repositories import classroom_storage as storage
from app.services import classroom as service
from app.api.routes import groups as group
from app.orchestrator.classroom import GameOrchestrator, DomainError
from app.domain.group_run import person_summary


def document():
    return {
        "title": "觀點測試",
        "mode": "static",
        "questions": [
            {
                "id": "q1",
                "title": "如何安排共同資源？",
                "scenario": "請說明你的理由與條件。",
                "options": [{"id": "a", "text": "先到先取"}, {"id": "b", "text": "平均分配"}],
                "duration_seconds": 90,
                "argument_required": True,
                "tutor_goal": "釐清原則",
                "probe_hints": ["為什麼？"],
                "max_focus_turns": 3,
                "focus_response_seconds": 90,
                "sender_point_cap": 5,
                "receiver_point_cap": 25,
            }
        ],
        "max_questions": 3,
        "preview_seconds": 8,
        "live_llm_call_budget": 30,
    }


@pytest.fixture
def classroom(monkeypatch):
    storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with storage.transaction() as db:
        people = [
            storage.Account(
                id=str(uuid4()),
                username="user" + str(i),
                email=f"u{i}@example.test",
                password_hash="fixture",
                verified=True,
            )
            for i in range(4)
        ]
        db.add_all(people)
        db.flush()
        teacher = people[0].id
        s = storage.Script(id=str(uuid4()), owner_id=teacher, document=document(), revision=1)
        db.add(s)
        db.flush()
        result = service.create_room(db, people[0], s.id)
        rid = result["id"]
        room = db.get(storage.Room, rid)
        for i, person in enumerate(people[1:]):
            service.join(
                db,
                person,
                SimpleNamespace(code=room.code, alias="同學" + str(i + 1), avatar="scholar"),
            )
    selected = {"id": teacher}
    monkeypatch.setattr(
        group, "actor", lambda db, request, mutation=False: db.get(storage.Account, selected["id"])
    )
    request = Request({"type": "http", "query_string": b"mode=teacher", "headers": []})
    yield rid, selected, request
    storage.engine().dispose()


def start(classroom, count=3, capacity=1):
    rid, selected, request = classroom
    v = group.view(rid, request)
    group.configure(
        rid,
        group.Configure(
            action_id=uuid4().hex,
            expected_roster_digest=v["roster_digest"],
            group_count=count,
            members_per_group=capacity,
        ),
        request,
    )
    body = group.Start(action_id=uuid4().hex, expected_roster_digest=v["roster_digest"])
    return group.start(rid, body, request), body


def test_shared_snapshot_independent_runs_and_exact_start(classroom):
    result, body = start(classroom)
    rid, _, request = classroom
    assert group.start(rid, body, request) == result
    with storage.transaction() as db:
        rooms = [db.get(storage.Room, g["id"]) for g in result["groups"]]
        assert len(rooms) == 3 and len({r.snapshot_id for r in rooms}) == 1
        assert all(len(r.state["portal_group"]["member_snapshot"]) == 1 for r in rooms)
        assert db.get(storage.Room, rid).state["phase"] == "group_overview"
        first = GameOrchestrator(rooms[0].state, time.time() + 4)
        first.tick()
        storage.persist_machine(db, rooms[0], first)
        assert rooms[0].state["phase"] == "answering"
        assert rooms[1].state["phase"] == "countdown"


def test_grace_phase_and_post_ack_evidence(classroom):
    result, _ = start(classroom)
    with storage.transaction() as db:
        room = db.get(storage.Room, result["groups"][0]["id"])
        state = deepcopy(room.state)
        mid = next(iter(state["members"]))
        machine = GameOrchestrator(state, time.time() + 4)
        machine.tick()
        machine.command("group_statement", {"text": "我重視每個人的需要。"}, mid, False)
        machine.command(
            "group_ack", {"summary_digest": person_summary(machine.s, mid)["digest"]}, mid, False
        )
        assert machine.s["portal_group"]["settlement"]["state"] == "CURRENT_PHASE_FINISHING"
        nextstage = GameOrchestrator(machine.s, machine.s["due_at"] + 0.1)
        nextstage.tick()
        assert nextstage.s["phase"] == "final_reflection"
        nextstage.command("group_statement", {"text": "緊急需求可以優先。"}, mid, False)
        assert nextstage.s["portal_group"]["arguments"][-1]["kind"] == "post_ack_observation"
        final = GameOrchestrator(nextstage.s, nextstage.now + 61)
        final.tick()
        assert final.s["phase"] == "summary"
        assert final.s["portal_group"]["settlement"]["final_stage_count"] == 1
        assert final.s["portal_group"]["settlement"]["state"] == "SETTLED"
        with pytest.raises(DomainError):
            final.command("group_statement", {"text": "late"}, mid, False)


def test_multiplayer_preserves_native_answer_logic(classroom):
    result, _ = start(classroom, count=1, capacity=3)
    with storage.transaction() as db:
        room = db.get(storage.Room, result["groups"][0]["id"])
        machine = GameOrchestrator(room.state, time.time() + 4)
        machine.tick()
        mid = next(iter(machine.s["members"]))
        run = machine.current()
        machine.command(
            "answer",
            {"question_run_id": run["id"], "option_id": "a", "text": "我的理由", "revision": 1},
            mid,
            False,
        )
        assert machine.current()["answers"][mid]["option_id"] == "a"
        assert machine.s["portal_group"]["arguments"][-1]["text"] == "我的理由"
        assert machine.s["phase"] == "answering"


def test_capacity_and_roster_guards(classroom):
    rid, _, request = classroom
    v = group.view(rid, request)
    with pytest.raises(DomainError):
        group.configure(
            rid,
            group.Configure(
                action_id=uuid4().hex,
                expected_roster_digest=v["roster_digest"],
                group_count=1,
                members_per_group=1,
            ),
            request,
        )
    with pytest.raises(DomainError):
        group.configure(
            rid,
            group.Configure(
                action_id=uuid4().hex,
                expected_roster_digest="old",
                group_count=3,
                members_per_group=1,
            ),
            request,
        )


def test_student_routing_and_teacher_only_analysis(classroom):
    result, _ = start(classroom)
    rid, selected, request = classroom
    with storage.transaction() as db:
        row = db.scalar(
            select(storage.Membership).where(
                storage.Membership.room_id == rid, storage.Membership.role == "student"
            )
        )
        selected["id"] = row.account_id
    with pytest.raises(DomainError):
        group.analysis(rid, request)
    student_request = Request({"type": "http", "query_string": b"mode=student", "headers": []})
    v = group.view(rid, student_request)
    assert v["route"]["group_id"] in [g["id"] for g in result["groups"]]
    with pytest.raises(DomainError):
        group.command(
            v["route"]["group_id"],
            group.GroupCommand(action_id=uuid4().hex, kind="next"),
            student_request,
        )

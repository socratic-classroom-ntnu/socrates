"""Classroom/group integration against the native SQLite test adapter.
Auth transport remains covered by the native suite; these tests inject identity.
"""

from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4
import time
import pytest
from starlette.requests import Request
from app.run2 import (
    storage,
    service,
    portal_group_api as group,
    portal_classroom_library as library,
)
from app.run2.orchestrator import DomainError, GameOrchestrator
from app.run2.portal_r73_contract import visible_evidence


def doc():
    from app.run2.contracts import ScriptDocument

    return ScriptDocument.model_validate(
        {
            "title": "同一教室多次完整遊戲",
            "questions": [
                {
                    "id": "q1",
                    "title": "共同資源",
                    "scenario": "說明你的原則",
                    "duration_seconds": 30,
                    "options": [
                        {"id": "a", "text": "需要"},
                        {"id": "b", "text": "公平"},
                        {"id": "c", "text": "貢獻"},
                    ],
                }
            ],
        }
    ).model_dump()


@pytest.fixture
def environment(monkeypatch):
    storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with storage.transaction() as db:
        people = [
            storage.Account(
                id=str(uuid4()),
                username=f"actor{i}",
                email=f"{i}@fixture.invalid",
                password_hash="fixture",
                verified=True,
            )
            for i in range(14)
        ]
        db.add_all(people)
        db.flush()
        ids = [p.id for p in people]
    who = {"id": ids[0]}

    def actor(db, request, mutation=False):
        return db.get(storage.Account, who["id"])

    monkeypatch.setattr(library, "user", actor)
    monkeypatch.setattr(group, "actor", actor)
    req = Request({"type": "http", "query_string": b"mode=teacher", "headers": []})
    yield ids, who, req
    storage.engine().dispose()


def create_assets(environment):
    ids, who, req = environment
    c = library.create_classroom(
        library.CreateClassroom(action_id=uuid4().hex, title="九月共思教室"), req
    )
    s = library.attach_script(
        c["id"], library.AttachScript(action_id=uuid4().hex, document=doc()), req
    )
    return c, s


def batch(environment, c, s):
    ids, who, req = environment
    body = library.CreateBatch(action_id=uuid4().hex, script_id=s["id"])
    b = library.create_batch(c["id"], body, req)
    assert library.create_batch(c["id"], body, req) == b
    with storage.transaction() as db:
        for i, pid in enumerate(ids[1:13]):
            a = db.get(storage.Account, pid)
            service.join(
                db, a, SimpleNamespace(code=b["code"], alias=f"同學{i+1}", avatar="scholar")
            )
    v = group.view(b["id"], req)
    group.configure(
        b["id"],
        group.Configure(
            action_id=uuid4().hex,
            expected_roster_digest=v["roster_digest"],
            group_count=4,
            members_per_group=3,
        ),
        req,
    )
    return group.start(
        b["id"], group.Start(action_id=uuid4().hex, expected_roster_digest=v["roster_digest"]), req
    )


def test_library_action_idempotency_and_payload_integrity(environment):
    _, _, req = environment
    body = library.CreateClassroom(action_id=uuid4().hex, title="同一資產容器")
    a = library.create_classroom(body, req)
    assert library.create_classroom(body, req) == a
    with pytest.raises(DomainError):
        library.create_classroom(body.model_copy(update={"title": "新內容"}), req)
    assert len(library.list_classrooms(req)) == 1


def test_classroom_owner_scope(environment):
    ids, who, req = environment
    c, s = create_assets(environment)
    who["id"] = ids[-1]
    assert library.list_classrooms(req) == []
    with pytest.raises(DomainError):
        library.classroom(c["id"], req)
    with pytest.raises(DomainError):
        library.attach_script(
            c["id"], library.AttachScript(action_id=uuid4().hex, script_id=s["id"]), req
        )


def test_twelve_members_four_independent_sessions(environment):
    _, _, req = environment
    c, s = create_assets(environment)
    out = batch(environment, c, s)
    assert len(out["groups"]) == 4
    with storage.transaction() as db:
        rooms = [db.get(storage.Room, g["id"]) for g in out["groups"]]
        assert sum(len(r.state["members"]) for r in rooms) == 12
        assert all(len(r.state["members"]) == 3 for r in rooms)
        assert len({r.snapshot_id for r in rooms}) == 1
        assert len({r.state["portal_group"]["asset_snapshot"]["digest"] for r in rooms}) == 1
        first = GameOrchestrator(rooms[0].state, time.time() + 4)
        first.tick()
        assert first.s["phase"] == "answering" and rooms[1].state["phase"] == "countdown"
        assert all(r.state["portal_group"]["runtime_mode"] == "native-group-stage" for r in rooms)
    history = library.classroom(c["id"], req)["sessions"]
    assert len([x for x in history if x["kind"] == "SESSION"]) == 4
    assert len({x["batch_id"] for x in history}) == 1


def test_multiple_batches_retain_history_and_snapshot(environment):
    _, _, req = environment
    c, s = create_assets(environment)
    first = batch(environment, c, s)
    with storage.transaction() as db:
        script = db.get(storage.Script, s["id"])
        new = deepcopy(script.document)
        new["title"] = "第二次課堂"
        script.document = new
        script.revision += 1
    second = batch(environment, c, s)
    first_ids = {g["id"] for g in first["groups"]}
    second_ids = {g["id"] for g in second["groups"]}
    assert first_ids.isdisjoint(second_ids)
    history = library.classroom(c["id"], req)["sessions"]
    assert len([x for x in history if x["kind"] == "SESSION"]) == 8
    with storage.transaction() as db:
        a = db.get(storage.Room, next(iter(first_ids)))
        b = db.get(storage.Room, next(iter(second_ids)))
        assert db.get(storage.Snapshot, a.snapshot_id).revision == 1
        assert db.get(storage.Snapshot, b.snapshot_id).revision == 2


def test_private_evidence_and_stage_projection(environment):
    _, _, req = environment
    c, s = create_assets(environment)
    out = batch(environment, c, s)
    with storage.transaction() as db:
        room = db.get(storage.Room, out["groups"][0]["id"])
        machine = GameOrchestrator(room.state, time.time() + 4)
        machine.tick()
        members = list(machine.s["members"])
        a, b = members[:2]
        machine.command("group_statement", {"text": "本人草稿"}, a, False)
        machine.command("group_statement", {"text": "另一位的理由"}, b, False)
        evidence = machine.s["portal_group"]
        nodes, _ = visible_evidence(evidence["arguments"], evidence["edges"], a, False)
        assert [x["text"] for x in nodes] == ["本人草稿"]
        evidence["arguments"][1]["visibility"] = "stage"
        nodes, _ = visible_evidence(evidence["arguments"], evidence["edges"], a, False)
        assert len(nodes) == 2


def test_per_option_representative_and_countdown(environment):
    _, _, req = environment
    c, s = create_assets(environment)
    out = batch(environment, c, s)
    with storage.transaction() as db:
        room = db.get(storage.Room, out["groups"][0]["id"])
        machine = GameOrchestrator(room.state, time.time() + 4)
        machine.tick()
        qid = machine.current()["id"]
        for i, mid in enumerate(machine.s["members"]):
            machine.s["members"][mid]["last_seen"] = machine.now + 100
            machine.command(
                "answer",
                {
                    "question_run_id": qid,
                    "option_id": ["a", "a", "b"][i],
                    "text": f"理由{i}",
                    "revision": 1,
                },
                mid,
                False,
            )
        assert machine.s["phase"] == "answering"
        at_end = GameOrchestrator(machine.s, machine.s["due_at"] + 0.01)
        at_end.tick()
        assert at_end.s["phase"] == "distribution"
        stage = GameOrchestrator(at_end.s, at_end.s["due_at"] + 0.01)
        stage.tick()
        assert stage.focus()["option_id"] == "a"
        stage.close_focus("fixture_finished")
        stage.next_focus()
        assert stage.focus()["option_id"] == "b"
        assert len(stage.current()["focuses"]) == 2

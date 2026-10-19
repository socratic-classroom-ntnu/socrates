"""每題每組的立場分佈（issue #15）：只計已確認的基準，只給教師。"""

import json
import time

import pytest
from starlette.requests import Request

from app.modules.group_dialogue.routes import groups as group
from app.modules.group_dialogue.stance import current_stance, stance_distribution
from app.modules.classroom_core.orchestrator import DomainError, GameOrchestrator
from app.modules.platform import storage as storage
from app.modules.classroom_core import runtime as service
from tests.classroom.test_group_personal import (
    answer,
    answer_in_group,
    as_member,
    confirm_personal,
    finish,
    reply,
    room,
    tutor,
)
from tests.classroom.test_groups import classroom, start  # noqa: F401
from app.modules.classroom_core.repositories import Room, persist_machine
from app.modules.analytics.routes import analysis


def counts(stance):
    return {row["option_id"]: row["count"] for row in stance["options"]}


def test_counts_come_from_confirmed_baselines_only():
    g = room(members=("m1", "m2", "m3", "m4"))
    answer(g, "m1", "a")
    answer(g, "m2", "b")
    answer(g, "m3", "a")
    stance = current_stance(g.s)
    # Answers alone are not stances yet: nobody has confirmed a baseline.
    assert counts(stance) == {"a": 0, "b": 0}
    assert (stance["confirmed"], stance["unconfirmed"], stance["differing"]) == (0, 4, False)
    assert stance["unconfirmed_by_status"]["probing"] == 3
    assert stance["unconfirmed_by_status"]["not_answered"] == 1

    confirm_personal(g, "m1")
    confirm_personal(g, "m2")
    finish(g, "m3", tutor())
    reply(g, "m3")
    finish(g, "m3", tutor())
    g.command("personal_unclear", {}, "m3", False)
    stance = current_stance(g.s)
    assert counts(stance) == {"a": 1, "b": 1}
    assert [row["percent"] for row in stance["options"]] == [50, 50]
    assert all("members" not in row for row in stance["options"])
    assert (stance["members"], stance["confirmed"], stance["unconfirmed"]) == (4, 2, 2)
    assert {k: v for k, v in stance["unconfirmed_by_status"].items() if v} == {
        "unclear": 1,
        "not_answered": 1,
    }
    assert set(stance["unconfirmed_by_status"]) == {
        "probing",
        "awaiting_confirm",
        "unclear",
        "capped",
        "incomplete",
        "unavailable",
        "not_answered",
    }
    assert stance["differing"] is True and stance["basis"] == "personal_baseline"
    assert (stance["question_index"], stance["question_id"]) == (0, "q1")

    # Once the stage closes, the teacher's numbers equal the group's own distribution.
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "distribution"
    run = g.current()
    stance = current_stance(g.s)
    assert counts(stance) == {d["option_id"]: d["count"] for d in run["distribution"]}
    # Answered without a baseline = the group's distribution_excluded; never-answered is apart.
    not_answered = stance["unconfirmed_by_status"]["not_answered"]
    assert stance["unconfirmed"] - not_answered == run["distribution_excluded"] == 1
    assert stance["run_phase"] == "distribution"


def test_one_held_option_is_not_differing_and_ai_baselines_count():
    g = room(members=("m1", "ai1"), ai=("ai1",))
    answer(g, "ai1", "a", "AI 的理由")
    answer(g, "m1", "a")
    stance = current_stance(g.s)
    assert counts(stance) == {"a": 1, "b": 0} and stance["differing"] is False
    confirm_personal(g, "m1")
    stance = current_stance(g.s)
    assert counts(stance) == {"a": 2, "b": 0} and stance["differing"] is False
    assert stance["unconfirmed"] == 0


def test_no_stance_before_the_first_question_and_one_row_per_run():
    g = room()
    before = GameOrchestrator(g.s, 0)
    before.s["runs"], before.s["question_index"] = [], 0
    assert current_stance(before.s) is None and stance_distribution(before.s) == []
    assert len(stance_distribution(g.s)) == 1


def drive_to_confirmed(db, group_id, choices):
    """Answer in seat order, then confirm each answering member's baseline."""
    members = answer_in_group(db, group_id, choices)
    room_row = db.get(Room, group_id)
    machine = GameOrchestrator(room_row.state, time.time())
    for m in members[: len(choices)]:
        confirm_personal(machine, m)
    persist_machine(db, room_row, machine)
    return members


def test_teacher_overview_and_analysis_show_each_groups_stance(classroom):  # noqa: F811
    # 3 students, 2 groups of up to 2 → Group 1 has two members, Group 2 has one.
    result, _ = start(classroom, count=2, capacity=2)
    rid, _, request = classroom
    first, second = result["groups"]
    with storage.transaction() as db:
        assert len(drive_to_confirmed(db, first["id"], ["a", "b"])) == 2
        room_row = db.get(Room, second["id"])
        machine = GameOrchestrator(room_row.state, time.time() + 4)
        machine.tick()
        persist_machine(db, room_row, machine)
    overview = {g["id"]: g["stance"] for g in group.view(rid, request)["groups"]}
    split, waiting = overview[first["id"]], overview[second["id"]]
    assert [(o["option_id"], o["text"], o["count"]) for o in split["options"]] == [
        ("a", "先到先取", 1),
        ("b", "平均分配", 1),
        ("__other__", "其他", 0),
    ]
    assert (split["confirmed"], split["unconfirmed"], split["differing"]) == (2, 0, True)
    assert sum(counts(waiting).values()) == 0 and waiting["confirmed"] == 0
    assert waiting["unconfirmed_by_status"]["not_answered"] == 1

    report = {g["id"]: g["stances"] for g in analysis(rid, request)["groups"]}
    assert report[first["id"]] == [split]
    assert report[second["id"]] == [waiting]


def test_students_never_receive_stance_distribution(classroom):  # noqa: F811
    result, _ = start(classroom, count=1, capacity=3)
    rid, selected, _ = classroom
    gid = result["groups"][0]["id"]
    with storage.transaction() as db:
        drive_to_confirmed(db, gid, ["a", "b"])
        as_member(db, selected, gid, 0)
    # A student asking for the teacher view still gets only student projections.
    asks_teacher = Request({"type": "http", "query_string": b"mode=teacher", "headers": []})
    with pytest.raises(DomainError, match="TEACHER_MEMBERSHIP_REQUIRED"):
        analysis(rid, asks_teacher)
    parent = group.view(rid, asks_teacher)
    assert set(parent) == {"kind", "id", "role", "route"} and parent["role"] == "student"
    run_view = group.view(gid, asks_teacher)
    assert run_view["role"] == "student"
    dumped = json.dumps(run_view, ensure_ascii=False)
    assert not {"stance", "stances"} & set(run_view)
    assert "unconfirmed_by_status" not in dumped and "differing" not in dumped
    with storage.transaction() as db:
        native = service.view(db, db.get(Room, gid), selected["id"], "teacher")
    assert native["role"] == "student"
    assert "unconfirmed_by_status" not in json.dumps(native, ensure_ascii=False)

"""分組課堂的個人對話：每位學生先與 AI 個別釐清立場，確認的基準才進入多人階段（QA B3、issue #13／#19）。

判準只有 orchestrator/policy.py 的 should_advance（經 classroom_policy.stage_goal）；本檔驅動
GameOrchestrator 並以假的 personal_tutor 工作結果推進。
"""

from copy import deepcopy
import json
import time
from uuid import uuid4

import pytest
from sqlalchemy import select
from starlette.requests import Request

from app.api.routes import groups as group
from app.domain.group_run import initialise, person_summary, personal_progress, student_actions
from app.orchestrator.classroom import DomainError, GameOrchestrator, fresh_state
from app.repositories import classroom_storage as storage
from app.services import classroom as service
from app.services.llm_workers import deterministic_result
from tests.classroom.test_groups import classroom, start  # noqa: F401

Q = {
    "id": "q1",
    "title": "情境一",
    "scenario": "選擇與理由",
    "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
    "duration_seconds": 90,
}
MET = {
    "has_position": True,
    "has_reason": True,
    "reason_tested": True,
    "position_shifted": False,
    "principle_label": "混合",
}
NOT_MET = {**MET, "reason_tested": False}
SHIFTED = {**MET, "position_shifted": True}
SUMMARY = {
    "current_position": "選甲",
    "reason_summary": "因為先到的人承擔了等待的成本",
    "relevant_conditions": ["沒有緊急需求時"],
    "unresolved_issue": "",
}


def tutor(observations=MET, text="你說的成本指的是什麼？", summary=SUMMARY):
    return {"reply_text": text, "observations": observations, "move": "probe", "summary": summary}


def room(members=("m1", "m2"), ai=(), **question):
    s = fresh_state("個人對話")
    s["members"] = {
        m: {
            "alias": "同學" + m,
            "avatar": "scholar",
            "last_seen": 10_000,
            "selected_count": 0,
            "achievements": [],
            "points": 0,
            "actor_type": "llm_student" if m in ai else "human",
        }
        for m in members
    }
    s["group"] = initialise("g1", "parent", "snap", list(members), "Group 1")
    g = GameOrchestrator(s, 100)
    doc = {"title": "個人對話", "questions": [{**deepcopy(Q), **question}]}
    g.command("start", {"script_document": doc}, None, True)
    g = GameOrchestrator(g.s, 104)
    g.tick()
    assert g.s["phase"] == "answering"
    return g


def answer(g, m, option="a", text=None):
    g.command(
        "answer",
        {
            "question_run_id": g.current()["id"],
            "option_id": option,
            "text": text or m + " 的理由",
            "revision": 1,
        },
        m,
        False,
    )


def entry(g, m):
    return g.current()["personal"][m]


def finish(g, m, result):
    g.complete_job("personal_tutor", entry(g, m)["job_key"], result, {"provider": "fixture"})


def reply(g, m, text="我指的是排隊的時間"):
    g.command("personal_message", {"text": text}, m, False)


def confirm(g, m):
    g.command("personal_confirm", {"summary_digest": entry(g, m)["summary_digest"]}, m, False)


def confirm_personal(g, m):
    """Drive one student's dialogue to a confirmed baseline the only legal way."""
    finish(g, m, tutor())
    reply(g, m)
    finish(g, m, tutor())
    confirm(g, m)
    assert entry(g, m)["status"] == "confirmed"


def test_confirm_requires_answering_a_follow_up():
    """B3 回歸：第一個 AI 結果即使旗標全真，也要先回應一次追問才可能待確認。"""
    g = room()
    answer(g, "m1")
    e = entry(g, "m1")
    assert e["status"] == "probing" and e["generating"]
    assert e["messages"][0] == {"role": "student", "text": "m1 的理由", "at": 104, "kind": "answer"}
    assert student_actions(g.s, "m1") == ["group_statement"]
    finish(g, "m1", tutor(MET))
    assert entry(g, "m1")["status"] == "probing"
    assert entry(g, "m1")["summary_digest"] is None
    assert "personal_confirm" not in student_actions(g.s, "m1")
    assert "personal_message" in student_actions(g.s, "m1")
    with pytest.raises(DomainError, match="PERSONAL_CONFIRM_REQUIRED"):
        g.command("personal_confirm", {"summary_digest": None}, "m1", False)
    reply(g, "m1")
    assert entry(g, "m1")["generating"] and "personal_message" not in student_actions(g.s, "m1")
    finish(g, "m1", tutor(MET))
    e = entry(g, "m1")
    assert e["status"] == "awaiting_confirm" and e["completed_turns"] == 1
    assert student_actions(g.s, "m1") == [
        "personal_confirm",
        "personal_revise",
        "personal_unclear",
        "group_statement",
    ]
    confirm(g, "m1")
    baseline = entry(g, "m1")["baseline"]
    assert baseline["option_id"] == "a" and baseline["position"] == "選甲"
    assert baseline["reason_summary"] == SUMMARY["reason_summary"]
    assert baseline["conditions"] == ["沒有緊急需求時"]
    assert baseline["evidence"] == [0, 2] and baseline["source"] == "student_confirmed"


def test_position_shifted_blocks_confirmation():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    reply(g, "m1")
    finish(g, "m1", tutor(SHIFTED))
    assert entry(g, "m1")["status"] == "probing"
    reply(g, "m1", "我還是選甲")
    finish(g, "m1", tutor(MET))
    assert entry(g, "m1")["status"] == "awaiting_confirm"


def test_reply_cap_marks_capped_without_baseline():
    g = room(max_personal_turns=2)
    answer(g, "m1")
    finish(g, "m1", tutor(NOT_MET))
    for _ in range(2):
        reply(g, "m1")
        finish(g, "m1", tutor(NOT_MET))
    e = entry(g, "m1")
    assert e["status"] == "capped" and e["completed_turns"] == 2
    assert e["summary"]["current_position"] == "選甲" and e["baseline"] is None
    assert not {"personal_message", "personal_confirm"} & set(student_actions(g.s, "m1"))
    with pytest.raises(DomainError, match="PERSONAL_TURN_REQUIRED"):
        reply(g, "m1")


def test_goal_met_on_the_cap_turn_is_awaiting_confirm():
    g = room(max_personal_turns=1)
    answer(g, "m1")
    finish(g, "m1", tutor(NOT_MET))
    reply(g, "m1")
    finish(g, "m1", tutor(MET))
    assert entry(g, "m1")["status"] == "awaiting_confirm"


def test_unavailable_keeps_message_and_retry_requeues_same_turn():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    reply(g, "m1", "保存我")
    old_key = entry(g, "m1")["job_key"]
    finish(g, "m1", {"tutor_unavailable": "OWNER_PROVIDER_PROFILE_REQUIRED"})
    e = entry(g, "m1")
    assert e["status"] == "unavailable" and not e["generating"]
    assert e["messages"][-1]["text"] == "保存我" and e["turn_index"] == 1
    assert "重試" in e["notice"]
    assert student_actions(g.s, "m1") == ["personal_retry", "group_statement"]
    with pytest.raises(DomainError, match="PERSONAL_TURN_REQUIRED"):
        reply(g, "m1")
    g.jobs.clear()
    g.command("personal_retry", {}, "m1", False)
    e = entry(g, "m1")
    assert e["status"] == "probing" and e["generating"] and e["turn_index"] == 1
    assert e["job_key"] != old_key and g.jobs[-1]["key"] == e["job_key"]
    assert g.jobs[-1]["context"]["history"][-1] == {"role": "student", "text": "保存我"}
    # The failed attempt's late result cannot advance the retried turn.
    g.complete_job("personal_tutor", old_key, tutor(), {})
    assert entry(g, "m1")["generating"] and len(entry(g, "m1")["messages"]) == 3
    finish(g, "m1", tutor())
    assert entry(g, "m1")["status"] == "awaiting_confirm"


def test_teacher_can_retry_an_unavailable_dialogue():
    g = room()
    answer(g, "m1")
    finish(g, "m1", {"tutor_unavailable": "X"})
    g.command("personal_retry", {"member_id": "m1"}, None, True)
    assert entry(g, "m1")["status"] == "probing" and entry(g, "m1")["generating"]


def test_stale_and_duplicate_results_do_not_double_advance():
    g = room()
    answer(g, "m1")
    first = entry(g, "m1")["job_key"]
    finish(g, "m1", tutor(text="第一則"))
    g.complete_job("personal_tutor", first, tutor(text="重複"), {})
    assert [m["text"] for m in entry(g, "m1")["messages"]] == ["m1 的理由", "第一則"]
    reply(g, "m1")
    g.complete_job("personal_tutor", first, tutor(text="過期"), {})
    g.complete_job("personal_tutor", "personal:other-run:m1:1:0", tutor(), {})
    g.complete_job("personal_tutor", "malformed", tutor(), {})
    e = entry(g, "m1")
    assert e["generating"] and e["status"] == "probing" and len(e["messages"]) == 3
    finish(g, "m1", tutor())
    finish(g, "m1", tutor())  # same key again: no second tutor message
    assert entry(g, "m1")["status"] == "awaiting_confirm"
    assert len(entry(g, "m1")["messages"]) == 4


def test_revise_reprobes_and_old_summary_cannot_be_confirmed():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    reply(g, "m1")
    finish(g, "m1", tutor())
    old_digest = entry(g, "m1")["summary_digest"]
    g.command("personal_revise", {"text": "其實我更在意公平"}, "m1", False)
    e = entry(g, "m1")
    assert e["status"] == "probing" and e["generating"] and e["summary"] is None
    assert e["messages"][-1] == {
        "role": "student",
        "text": "其實我更在意公平",
        "at": 104,
        "kind": "revision",
    }
    with pytest.raises(DomainError, match="PERSONAL_CONFIRM_REQUIRED"):
        g.command("personal_confirm", {"summary_digest": old_digest}, "m1", False)
    finish(g, "m1", tutor(summary={**SUMMARY, "reason_summary": "公平"}))
    assert entry(g, "m1")["status"] == "awaiting_confirm"
    with pytest.raises(DomainError, match="CURRENT_SUMMARY_DIGEST_REQUIRED"):
        g.command("personal_confirm", {"summary_digest": old_digest}, "m1", False)
    confirm(g, "m1")
    assert entry(g, "m1")["baseline"]["reason_summary"] == "公平"


def test_empty_reply_is_refused():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    with pytest.raises(DomainError, match="ARGUMENT_REQUIRED"):
        reply(g, "m1", "   ")
    assert entry(g, "m1")["turn_index"] == 0 and len(entry(g, "m1")["messages"]) == 2


def test_unclear_is_terminal_without_baseline():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    reply(g, "m1")
    finish(g, "m1", tutor())
    g.command("personal_unclear", {}, "m1", False)
    e = entry(g, "m1")
    assert e["status"] == "unclear" and e["baseline"] is None
    assert student_actions(g.s, "m1") == ["group_statement"]


def test_personal_stage_follows_answering_and_closes_on_teacher_next():
    g = room(personal_seconds=120)
    answer(g, "m1")
    answer(g, "m2", "b")
    confirm_personal(g, "m1")
    finish(g, "m2", tutor())
    g.command("next", {}, None, True)
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "personal" and g.current()["phase"] == "personal"
    assert g.s["deadline_at"] == g.now + 120
    assert personal_progress(g.s)["confirmed"] == 1 and personal_progress(g.s)["probing"] == 1
    reply(g, "m2")  # still open for the unfinished student
    late_key = entry(g, "m2")["job_key"]
    g.command("next", {}, None, True)
    assert g.s["phase"] == "distribution"
    e = entry(g, "m2")
    assert e["status"] == "incomplete" and e["status_at_close"] == "probing"
    assert e["end_reason"] == "teacher_next" and not e["generating"]
    assert entry(g, "m1")["status"] == "confirmed"
    with pytest.raises(DomainError, match="PERSONAL_WINDOW_CLOSED"):
        reply(g, "m2")
    g.complete_job("personal_tutor", late_key, tutor(), {})
    assert entry(g, "m2")["status"] == "incomplete"
    assert student_actions(g.s, "m2") == ["group_statement"]


def test_personal_stage_deadline_marks_incomplete():
    g = room(personal_seconds=60)
    answer(g, "m1")
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "personal"
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "distribution"
    assert entry(g, "m1")["status"] == "incomplete" and entry(g, "m1")["end_reason"] == "deadline"


def test_personal_stage_ends_when_every_student_has_a_result():
    g = room()
    answer(g, "m1")
    answer(g, "m2")
    confirm_personal(g, "m1")
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "personal"
    finish(g, "m2", tutor())
    reply(g, "m2")
    finish(g, "m2", tutor())
    g.command("personal_unclear", {}, "m2", False)
    assert g.s["phase"] == "distribution"


def test_all_settled_during_answering_skips_personal_phase():
    g = room()
    answer(g, "m1")
    confirm_personal(g, "m1")
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "distribution"


def test_distribution_and_representatives_use_only_baselines():
    g = room(members=("m1", "m2", "m3"))
    answer(g, "m1", "a", "原本的理由")
    answer(g, "m2", "b")
    answer(g, "m3", "a")
    confirm_personal(g, "m1")
    finish(g, "m3", tutor())
    reply(g, "m3")
    finish(g, "m3", tutor())
    g.command("personal_unclear", {}, "m3", False)
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    g.command("next", {}, None, True)  # m2 still probing → incomplete
    run = g.current()
    assert g.s["phase"] == "distribution"
    assert {d["option_id"]: d["count"] for d in run["distribution"]} == {"a": 1, "b": 0}
    assert run["distribution_excluded"] == 2
    g.command("next", {}, None, True)
    f = g.focus()
    assert g.s["phase"] == "focus" and f["member_id"] == "m1"
    assert f["argument"] == SUMMARY["reason_summary"]
    g.close_focus("fixture")
    g.command("next", {}, None, True)
    assert [x["member_id"] for x in g.current()["focuses"]] == ["m1"]
    assert g.s["phase"] == "viewpoint_review"


def test_ai_students_get_baseline_without_probing():
    g = room(members=("m1", "ai1"), ai=("ai1",))
    g.jobs.clear()
    answer(g, "ai1", "b", "AI 的理由")
    e = entry(g, "ai1")
    assert e["status"] == "confirmed" and e["messages"] == []
    assert e["baseline"]["source"] == "ai_student"
    assert e["baseline"]["option_id"] == "b" and e["baseline"]["reason_summary"] == "AI 的理由"
    assert not [j for j in g.jobs if j["kind"] == "personal_tutor"]
    g = GameOrchestrator(g.s, g.s["due_at"])
    g.tick()
    assert g.s["phase"] == "distribution"  # the human never answered


def test_job_context_carries_only_this_student():
    g = room()
    answer(g, "m2", "b", "別人的私人理由")
    answer(g, "m1")
    job = g.jobs[-1]
    assert job["kind"] == "personal_tutor"
    assert job["key"] == f'personal:{g.current()["id"]}:m1:0:0'
    assert "別人的私人理由" not in json.dumps(job["context"], ensure_ascii=False)
    assert job["context"]["option_text"] == "甲"
    assert job["context"]["max_personal_turns"] == 6


def test_no_llm_fallback_pauses_instead_of_completing():
    result, audit = deterministic_result(
        {"kind": "personal_tutor", "context": {}, "key": "personal:r:m:0:0"}, "X"
    )
    assert result == {"tutor_unavailable": "X"} and audit["fallback_used"] is True


def test_group_ack_still_only_in_review_phases():
    g = room()
    answer(g, "m1")
    confirm_personal(g, "m1")
    assert "group_ack" not in student_actions(g.s, "m1")
    with pytest.raises(DomainError, match="CONFIRMABLE_PHASE_REQUIRED"):
        g.command("group_ack", {"summary_digest": person_summary(g.s, "m1")["digest"]}, "m1", False)
    g.s["phase"] = "viewpoint_review"
    assert student_actions(g.s, "m1") == ["group_statement", "group_ack"]


def test_non_member_and_non_group_runs_are_refused():
    g = room()
    answer(g, "m1")
    with pytest.raises(DomainError, match="GROUP_MEMBERSHIP_REQUIRED"):
        g.command("personal_message", {"text": "x"}, "intruder", False)
    with pytest.raises(DomainError, match="PERSONAL_DIALOGUE_REQUIRED"):
        g.command("personal_message", {"text": "x"}, "m2", False)
    s = fresh_state("全班")
    s["members"] = {"m1": deepcopy(g.s["members"]["m1"])}
    native = GameOrchestrator(s, 100)
    native.command("start", {"script_document": {"title": "x", "questions": [Q]}}, None, True)
    native = GameOrchestrator(native.s, 104)
    native.tick()
    answer(native, "m1")
    assert "personal" not in native.current()
    with pytest.raises(DomainError, match="KNOWN_ACTION_REQUIRED"):
        native.command("personal_message", {"text": "x"}, "m1", False)
    native = GameOrchestrator(native.s, native.s["due_at"])
    native.tick()
    assert native.s["phase"] == "distribution"
    assert native.current()["distribution"][0]["count"] == 1


def answer_in_group(db, group_id, choices):
    """Tick a group into answering and submit `choices` (option ids) in seat order."""
    room = db.get(storage.Room, group_id)
    machine = GameOrchestrator(room.state, time.time() + 4)
    machine.tick()
    run = machine.current()
    for mid, option in zip(machine.s["group"]["member_snapshot"], choices):
        machine.command(
            "answer",
            {"question_run_id": run["id"], "option_id": option, "text": "理由", "revision": 1},
            mid,
            False,
        )
    storage.persist_machine(db, room, machine)
    return machine.s["group"]["member_snapshot"]


def as_member(db, selected, group_id, index):
    row = db.scalars(
        select(storage.Membership)
        .where(storage.Membership.room_id == group_id, storage.Membership.role == "student")
        .order_by(storage.Membership.seat)
    ).all()[index]
    selected["id"] = row.account_id
    return row.id


def test_views_keep_personal_dialogues_private(classroom):  # noqa: F811
    result, _ = start(classroom, count=1, capacity=3)
    rid, selected, teacher_request = classroom
    gid = result["groups"][0]["id"]
    teacher_id = selected["id"]
    with storage.transaction() as db:
        a, b, _ = answer_in_group(db, gid, ["a", "b"])
        room_row = db.get(storage.Room, gid)
        machine = GameOrchestrator(room_row.state, time.time())
        for m, text in [(a, "給甲的追問"), (b, "給乙的私密追問")]:
            key = machine.current()["personal"][m]["job_key"]
            machine.complete_job("personal_tutor", key, tutor(text=text), {"provider": "fixture"})
        storage.persist_machine(db, room_row, machine)
        assert as_member(db, selected, gid, 0) == a
    student_request = Request({"type": "http", "query_string": b"mode=student", "headers": []})
    group.command(
        gid,
        group.GroupCommand(
            action_id=uuid4().hex, kind="personal_message", data={"text": "我的私人回覆"}
        ),
        student_request,
    )
    mine = group.view(gid, student_request)
    assert [m["text"] for m in mine["personal"]["messages"]] == [
        "理由",
        "給甲的追問",
        "我的私人回覆",
    ]
    assert mine["personal"]["status"] == "probing" and mine["personal"]["generating"]
    assert mine["available_actions"] == ["group_statement"]
    dumped = json.dumps(mine, ensure_ascii=False)
    assert "給乙的私密追問" not in dumped and "personal_overview" in mine
    assert mine["personal_overview"] is None and mine["personal_progress"] is None
    with storage.transaction() as db:
        native = service.view(db, db.get(storage.Room, gid), selected["id"])
    assert "給乙的私密追問" not in json.dumps(native, ensure_ascii=False)
    with pytest.raises(DomainError, match="GROUP_COMMAND_REQUIRED"):
        group.command(
            gid,
            group.GroupCommand(action_id=uuid4().hex, kind="focus_message"),
            student_request,
        )
    selected["id"] = teacher_id
    teacher = group.view(gid, teacher_request)
    assert teacher["personal"] is None and teacher["available_actions"] == []
    assert teacher["personal_progress"]["probing"] == 2
    assert teacher["personal_progress"]["not_answered"] == 1
    overview = {row["member_id"]: row for row in teacher["personal_overview"]}
    assert overview[b]["summary"]["current_position"] == "選甲"
    teacher_dump = json.dumps(teacher, ensure_ascii=False)
    assert "給乙的私密追問" not in teacher_dump and "我的私人回覆" not in teacher_dump
    with storage.transaction() as db:
        native = service.view(db, db.get(storage.Room, gid), teacher_id, "teacher")
    assert "給乙的私密追問" not in json.dumps(native, ensure_ascii=False)
    assert "personal" in native["summaries"]["records"][0]
    parent = group.view(rid, teacher_request)
    assert parent["groups"][0]["personal_progress"]["probing"] == 2

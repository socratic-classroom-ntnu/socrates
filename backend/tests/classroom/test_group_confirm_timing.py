"""QA B01／B17、A01／A08／A11、「設定兩題卻在第一題後結束課堂」：分組課堂的觀點確認只在題目都結束後開放，
途中確認不能跳過代表討論或提早結束課堂。"""

from copy import deepcopy

import pytest

from app.modules.group_dialogue.domain.group_run import initialise, person_summary
from app.modules.classroom_core.orchestrator.classroom import (
    DomainError,
    GameOrchestrator,
    fresh_state,
)
from tests.classroom.test_group_personal import confirm_personal

Q = {
    "id": "q1",
    "title": "情境一",
    "scenario": "選擇與理由",
    "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
    "duration_seconds": 90,
}


def doc(mode):
    q2 = {**deepcopy(Q), "id": "q2", "title": "情境二"}
    return {
        "title": "B2",
        "mode": mode,
        "questions": [deepcopy(Q), q2] if mode == "static" else [deepcopy(Q)],
        "max_questions": 2,
        "preview_seconds": 8,
    }


def group_room(mode):
    s = fresh_state("B2")
    s["members"] = {
        m: {
            "alias": m,
            "avatar": "scholar",
            "last_seen": 10_000,
            "selected_count": 0,
            "achievements": [],
            "points": 0,
        }
        for m in ["m1", "m2"]
    }
    s["group"] = initialise("g1", "parent", "snap", ["m1", "m2"], "Group 1")
    g = GameOrchestrator(s, 100)
    g.command("start", {"script_document": doc(mode)}, None, True)
    g = GameOrchestrator(g.s, 104)
    g.tick()
    assert g.s["phase"] == "answering" and g.s["question_index"] == 0
    return g


def answer_all(g, now=110):
    for m in ["m1", "m2"]:
        g = GameOrchestrator(g.s, now)
        g.command(
            "answer",
            {
                "question_run_id": g.current()["id"],
                "option_id": "a",
                "text": m + " 的理由",
                "revision": 1,
            },
            m,
            False,
        )
    return g


def ack_all(g):
    for m in ["m1", "m2"]:
        g.command("group_ack", {"summary_digest": person_summary(g.s, m)["digest"]}, m, False)
    return g


TUTOR = {
    "reply_text": "為什麼？",
    "observations": {
        "position_clarity": 3,
        "reasoning_depth": 3,
        "counterargument_engagement": 3,
        "evidence_use": 3,
        "value_articulation": 3,
    },
    "micro_summary": "小結",
}


def drive(g, max_steps=60):
    """Teacher presses 下一步 / server ticks / jobs complete until q2 starts or class ends."""
    now = g.now
    for _ in range(max_steps):
        if g.s["phase"] == "summary" or (
            g.s["question_index"] >= 1 and g.s["phase"] == "answering"
        ):
            return g
        now += 1
        g = GameOrchestrator(g.s, now)
        phase = g.s["phase"]
        if phase == "focus":
            f = g.focus()
            if f and f["status"] == "GENERATING":
                g.complete_job("focused_tutor", f["job_key"], {"tutor_unavailable": "X"}, {})
            g.command("next", {}, None, True)
        elif phase == "question_summary":
            key = g.s.get("pending_generation")
            if key:
                q = {**deepcopy(Q), "id": "gen2", "title": "生成情境二"}
                g.complete_job("dynamic_question", key, {"question": q}, {})
            else:
                g = GameOrchestrator(g.s, now + 100)
                g.tick()
        elif phase in {"distribution", "focus_summary", "preview", "answering", "personal"}:
            # personal：老師收個人階段，未完成者標為 incomplete（不進入分布與代表）。
            g.command("next", {}, None, True)
        elif phase in {"final_reflection", "viewpoint_review"}:
            g.command("next", {}, None, True)
        else:
            g = GameOrchestrator(g.s, now + 100)
            g.tick()
        now += 0.5
        g = GameOrchestrator(g.s, now)
        g.tick()
    return g


@pytest.mark.parametrize(
    ("phase", "settlement_state"),
    [("focus", "EXPLORING"), ("viewpoint_review", "EXPLORING")],
)
def test_teacher_can_end_with_unconfirmed_members_marked_incomplete(phase, settlement_state):
    g = group_room("static")
    g.s["phase"] = phase
    g.s["group"]["settlement"] = {"state": settlement_state}
    for member in ["m1", "m2"]:
        g.command("group_statement", {"text": member + " 的最後觀點"}, member, False)
    if phase == "viewpoint_review":
        g.command(
            "group_ack",
            {"summary_digest": person_summary(g.s, "m1")["digest"]},
            "m1",
            False,
        )

    g.command("end", {}, None, True)

    settlement = g.s["group"]["settlement"]
    assert g.s["phase"] == "summary"
    assert settlement["state"] == "SETTLED"
    assert settlement["ended_by"] == "teacher"
    assert settlement["end_reason"] == "teacher_force_end"
    assert settlement["incomplete_members"] == (["m1", "m2"] if phase == "focus" else ["m2"])
    expected_status = (
        {"m1": "incomplete", "m2": "incomplete"}
        if phase == "focus"
        else {"m1": "confirmed", "m2": "incomplete"}
    )
    assert settlement["member_status"] == expected_status
    assert set(g.s["group"]["confirmations"]) == (set() if phase == "focus" else {"m1"})
    expected_points = [] if phase == "focus" else ["m1：m1 的最後觀點"]
    assert g.s["summaries"]["class"]["key_points"] == expected_points


def test_next_from_viewpoint_review_enters_final_reflection():
    g = group_room("static")
    g.s["phase"] = "viewpoint_review"
    g.s["group"]["settlement"] = {"state": "CURRENT_PHASE_FINISHING"}

    g.command("next", {}, None, True)

    assert g.s["phase"] == "final_reflection"
    assert g.s["group"]["settlement"]["state"] == "FINAL_STAGE"
    assert g.s["group"]["settlement"]["final_stage_count"] == 1


def test_next_from_final_reflection_settles_normally():
    g = group_room("static")
    g.s["phase"] = "final_reflection"
    g.s["group"]["settlement"] = {"state": "FINAL_STAGE"}

    g.command("next", {}, None, True)

    settlement = g.s["group"]["settlement"]
    assert g.s["phase"] == "summary"
    assert settlement["state"] == "SETTLED"
    assert settlement["end_reason"] == "final_stage_complete"


@pytest.mark.parametrize("mode", ["static", "dynamic"])
def test_group_without_ack_reaches_q2(mode):
    g = drive(answer_all(group_room(mode)))
    assert g.s["phase"] == "answering" and g.s["question_index"] == 1


@pytest.mark.parametrize("mode", ["static", "dynamic"])
def test_ack_during_q1_is_refused_and_class_reaches_q2(mode):
    g = answer_all(group_room(mode))
    for m in ["m1", "m2"]:
        with pytest.raises(DomainError, match="CONFIRMABLE_PHASE_REQUIRED"):
            g.command("group_ack", {"summary_digest": person_summary(g.s, m)["digest"]}, m, False)
    assert g.s["group"]["settlement"]["state"] == "EXPLORING"
    g = drive(g)
    assert g.s["question_index"] == 1 and g.s["phase"] == "answering"


@pytest.mark.parametrize("mode", ["static", "dynamic"])
def test_q1_reaches_representative_discussion_with_different_options(mode):
    g = group_room(mode)
    for m, option in [("m1", "a"), ("m2", "b")]:
        g = GameOrchestrator(g.s, 110)
        g.command(
            "answer",
            {
                "question_run_id": g.current()["id"],
                "option_id": option,
                "text": m + " 的理由",
                "revision": 1,
            },
            m,
            False,
        )
        # 代表只從已確認的個人基準中選出：每位學生先完成自己的 AI 追問並確認。
        confirm_personal(g, m)
    now = 111
    while g.s["phase"] not in {"focus", "summary", "final_reflection"} and now < 140:
        g = GameOrchestrator(g.s, now)
        g.command("next", {}, None, True)
        g = GameOrchestrator(g.s, now + 0.5)
        g.tick()
        now += 1
    assert g.s["phase"] == "focus"
    assert g.current()["focuses"] and g.focus()["status"] == "GENERATING"


def test_non_group_static_two_questions_reaches_q2():
    s = fresh_state("B2")
    s["members"] = {
        "m1": {
            "alias": "m1",
            "avatar": "s",
            "last_seen": 10_000,
            "selected_count": 0,
            "achievements": [],
            "points": 0,
        }
    }
    g = GameOrchestrator(s, 100)
    g.command("start", {"script_document": doc("static")}, None, True)
    g = GameOrchestrator(g.s, 104)
    g.tick()
    g = GameOrchestrator(g.s, 110)
    g.command(
        "answer",
        {"question_run_id": g.current()["id"], "option_id": "a", "text": "x", "revision": 1},
        "m1",
        False,
    )
    g = drive(g)
    assert g.s["phase"] == "answering" and g.s["question_index"] == 1

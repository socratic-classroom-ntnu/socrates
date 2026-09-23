import random
import pytest
from app.run2.contracts import ScriptDocument
from app.run2.orchestrator import GameOrchestrator, DomainError, fresh_state
from app.run2.policy import choose_representative, stage_goal, majority_context

DOC = {
    "title": "倫理教室",
    "questions": [
        {
            "id": "q1",
            "title": "選擇",
            "scenario": "選擇與理由",
            "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
            "duration_seconds": 90,
        }
    ],
}


def room():
    s = fresh_state("倫理教室")
    s["members"] = {
        x: {
            "alias": x,
            "avatar": "scholar",
            "last_seen": 100,
            "selected_count": 0,
            "achievements": [],
            "points": 0,
        }
        for x in ["m1", "m2", "m3"]
    }
    g = GameOrchestrator(s, 100)
    g.command("start", {"script_document": DOC}, None, True)
    g = GameOrchestrator(g.s, 103)
    g.tick()
    return g


def draft(g, member="m1", option="a", text="我的原則", kind="draft", revision=1, now=110):
    x = GameOrchestrator(g.s, now)
    x.command(
        kind,
        {
            "question_run_id": x.current()["id"],
            "option_id": option,
            "text": text,
            "revision": revision,
        },
        member,
        False,
    )
    return x


def test_countdown_shared_deadline():
    g = room()
    assert g.s["phase"] == "answering"
    assert g.s["deadline_at"] == 193
    assert g.s["due_at"] == 193.1


def test_choice_return_keeps_draft_until_submit():
    g = draft(room())
    g = draft(g, option="b", revision=2)
    assert g.current()["drafts"]["m1"]["text"] == "我的原則"
    assert g.current()["answers"] == {}
    g = draft(g, option="b", kind="answer", revision=3)
    assert g.current()["answers"]["m1"]["option_id"] == "b"
    with pytest.raises(DomainError):
        draft(g, option="a", revision=4)


def test_grace_sync_precedes_server_finalize():
    g = draft(room(), now=193.05)
    x = GameOrchestrator(g.s, 193.099)
    x.tick()
    assert x.s["phase"] == "answering"
    x = GameOrchestrator(x.s, 193.101)
    x.tick()
    assert x.s["phase"] == "distribution"
    assert x.current()["answers"]["m1"]["via"] == "server-finalize"


def test_option_only_and_argument_required():
    g = draft(room(), text="")
    x = GameOrchestrator(g.s, 194)
    x.tick()
    assert x.current()["answers"] == {}
    g.s["questions"][0]["argument_required"] = False
    x = GameOrchestrator(g.s, 194)
    x.tick()
    assert x.current()["answers"]["m1"]["argument"] == ""


def test_stale_draft_has_no_effect():
    g = draft(room(), revision=5, text="new")
    g = draft(g, revision=3, text="old")
    assert g.current()["drafts"]["m1"]["text"] == "new"


def test_teacher_next_waits_grace():
    g = draft(room())
    g.command("next", {}, None, True)
    assert g.s["due_at"] == 110.1
    x = GameOrchestrator(g.s, 110.05)
    x.tick()
    assert x.s["phase"] == "answering"
    x = GameOrchestrator(x.s, 110.101)
    x.tick()
    assert x.s["phase"] == "distribution"


def test_fair_selection_lowest_count():
    members = {
        x: {"last_seen": 100, "selected_count": c} for x, c in [("x", 4), ("y", 0), ("z", 1)]
    }
    answers = {m: {"option_id": "a", "argument": "because"} for m in members}
    assert choose_representative("a", answers, members, set(), 100, random.Random(1)) == "y"
    assert choose_representative("b", answers, members, set(), 100) is None


def test_policy_truth_table():
    for turns in [0, 1, 3]:
        for position in [True, False]:
            for reason in [True, False]:
                for tested in [True, False]:
                    for shifted in [True, False]:
                        o = dict(
                            has_position=position,
                            has_reason=reason,
                            reason_tested=tested,
                            position_shifted=shifted,
                        )
                        assert stage_goal(o, turns) == bool(
                            turns >= 1 and position and reason and tested and not shifted
                        )


def focus_room():
    g = draft(room(), kind="answer", now=110)
    g.s["members"]["m1"]["last_seen"] = 195
    g = GameOrchestrator(g.s, 194)
    g.tick()
    g = GameOrchestrator(g.s, 199.1)
    g.tick()
    return g


def result():
    return {
        "reply_text": "你的理由適用哪些情況？",
        "observations": {},
        "move": "probe",
        "micro_summary": "用原則衡量選擇",
    }


def test_teacher_next_finishes_current_reply():
    g = focus_room()
    assert g.s["phase"] == "focus"
    f = g.focus()
    key = f["job_key"]
    g.command("next", {}, None, True)
    assert g.focus()["advance_requested"]
    g.complete_job("focused_tutor", key, result(), {"provider": "scripted"})
    assert g.s["phase"] == "focus_summary"
    assert g.focus()["micro_summary"] == "用原則衡量選擇"


def test_wrong_generation_keeps_focus():
    g = focus_room()
    g.complete_job("focused_tutor", "other", result(), {})
    assert g.focus()["messages"] == []


def test_dynamic_awaits_provider_then_auto_accept():
    g = focus_room()
    g.s["script"]["mode"] = "dynamic"
    g.s["script"]["max_questions"] = 2
    g.command("next", {}, None, True)
    g.complete_job("focused_tutor", g.focus()["job_key"], result(), {})
    g = GameOrchestrator(g.s, 203)
    g.tick()
    assert g.s["phase"] == "question_summary"
    job = next(j for j in g.jobs if j["kind"] == "dynamic_question")
    g = GameOrchestrator(g.s, 999)
    g.tick()
    assert g.s["phase"] == "question_summary"
    q = DOC["questions"][0].copy()
    q["id"] = "q2"
    g.complete_job("dynamic_question", job["key"], {"question": q}, {})
    assert g.s["phase"] == "preview"
    g = GameOrchestrator(g.s, 1008)
    g.tick()
    assert g.s["phase"] == "answering"
    assert g.s["question_index"] == 1


def test_all_zero_answers_complete_without_representative():
    g = room()
    g = GameOrchestrator(g.s, 194)
    g.tick()
    g = GameOrchestrator(g.s, 200)
    g.tick()
    assert g.s["phase"] == "summary"


def test_schema_unique_option_ids():
    doc = DOC.copy()
    doc["questions"] = [
        {**DOC["questions"][0], "options": [{"id": "a", "text": "x"}, {"id": "a", "text": "y"}]}
    ]
    with pytest.raises(ValueError):
        ScriptDocument.model_validate(doc)


def test_majority_context_preserves_tie():
    ctx = majority_context(
        DOC["questions"][0], {"x": {"option_id": "a"}, "y": {"option_id": "b"}}, []
    )
    assert ctx["majority_options"] == ["a", "b"]

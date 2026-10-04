from app.orchestrator.classroom import GameOrchestrator, fresh_state
from app.api.routes.ai_students import fallback_other_suggestion
from app.services.ai_students import (
    OTHER_ID,
    ensure_other_options,
    fallback_turn,
)
from app.domain.group_run import initialise


def document():
    return {
        "title": "R88",
        "mode": "static",
        "max_questions": 1,
        "preview_seconds": 8,
        "live_llm_call_budget": 30,
        "questions": [
            {
                "id": "q1",
                "title": "共同抉擇",
                "scenario": "你會優先保護哪一個價值？",
                "duration_seconds": 90,
                "argument_required": True,
                "tutor_goal": "辨認原則",
                "probe_hints": ["你的理由是什麼？"],
                "max_focus_turns": 1,
                "focus_response_seconds": 90,
                "sender_point_cap": 5,
                "receiver_point_cap": 25,
                "options": [
                    {"id": "a", "text": "結果"},
                    {"id": "b", "text": "責任"},
                ],
            }
        ],
    }


def state():
    s = fresh_state("R88")
    s["members"]["m1"] = {
        "account_id": "a1",
        "username": "ai-1",
        "alias": "公平檢查者 · AI",
        "avatar": "ai-student",
        "seat": 0,
        "last_seen": 0,
        "selected_count": 0,
        "points": 0,
        "achievements": [],
        "reactions_sent": 0,
        "reactions_received": 0,
        "actor_type": "llm_student",
        "persona": {"id": "fairness", "values": ["公平"], "seed": 7},
        "model": "fixture",
    }
    s["portal_group"] = initialise("g1", "c1", "s1", ["m1"], "Group 1")
    return s


def test_other_option_is_server_enforced_once():
    first = ensure_other_options(document())
    second = ensure_other_options(first)
    ids = [row["id"] for row in second["questions"][0]["options"]]
    assert ids.count(OTHER_ID) == 1


def test_llm_student_uses_native_job_and_answer_contract(monkeypatch):
    monkeypatch.setenv("PORTAL_AI_PHASE_SECONDS", "1")
    machine = GameOrchestrator(state(), 0)
    machine.command("start", {"script_document": ensure_other_options(document())}, None, True)
    assert machine.s["phase"] == "countdown"
    assert machine.s["deadline_at"] == 1

    tick = GameOrchestrator(machine.s, 2)
    tick.tick()
    jobs = [job for job in tick.jobs if job["kind"] == "llm_student_turn"]
    assert len(jobs) == 1

    completed = GameOrchestrator(tick.s, 3)
    completed.complete_job(
        "llm_student_turn",
        jobs[0]["key"],
        {
            "action_mode": "answer",
            "option_id": "a",
            "text": "我重視公平，也願意比較後果。",
            "relation": "qualifies",
            "should_confirm": False,
        },
        {"provider": "fixture", "actual_model": "fixture"},
    )
    assert completed.current()["answers"]["m1"]["option_id"] == "a"
    assert completed.current()["answers"]["m1"]["suggestion"]["actor_type"] == "llm_student"


def test_fallbacks_are_typed_and_repeatable():
    body = type(
        "Body",
        (),
        {
            "model_dump": lambda self: {
                "question_id": "q1",
                "title": "問題",
                "scenario": "情境",
                "existing_options": ["A", "B"],
            }
        },
    )()
    suggestion = fallback_other_suggestion(body)
    assert suggestion["suggestion_text"]
    turn = fallback_turn(
        {
            "question": ensure_other_options(document())["questions"][0],
            "persona": {"values": ["公平"]},
            "seed": 3,
            "action_mode": "answer",
        }
    )
    assert turn["action_mode"] == "answer"
    assert turn["text"]

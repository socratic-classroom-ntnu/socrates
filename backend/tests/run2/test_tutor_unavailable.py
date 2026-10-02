import pytest

from app.run2.policy import majority_context
from app.run2.workers import deterministic_result
from tests.run2.test_domain import focus_room

CURRENT = {
    "id": "q1",
    "title": "選擇",
    "scenario": "s",
    "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
    "probe_hints": ["老師寫給模型的提示"],
}


def test_focus_fallback_does_not_speak_the_probe_hint():
    item = {
        "kind": "focused_tutor",
        "key": "focus:f1:0",
        "context": {**majority_context(CURRENT, {}, []), "turn_index": 0, "argument": "x"},
    }
    result, audit = deterministic_result(item, "CLASSROOM_BUDGET_AVAILABILITY")
    assert "reply_text" not in result
    assert result["tutor_unavailable"] == "CLASSROOM_BUDGET_AVAILABILITY"
    assert audit["fallback_used"] is True


@pytest.mark.parametrize(
    "reason, fragment",
    [
        ("CLASSROOM_BUDGET_AVAILABILITY", "額度已達上限"),
        ("CLASSROOM_TOKEN_BUDGET_AVAILABILITY", "額度已達上限"),
        ("GLOBAL_BUDGET_AVAILABILITY", "額度已達上限"),
        ("OWNER_PROVIDER_PROFILE_REQUIRED", "尚未設定 LLM"),
        ("TimeoutError", "暫時無法連線"),
    ],
)
def test_unavailable_tutor_pauses_the_focus_until_the_teacher_moves_on(reason, fragment):
    g = focus_room()
    f = g.focus()
    before = len(f["messages"])
    g.complete_job("focused_tutor", f["job_key"], {"tutor_unavailable": reason}, {})
    assert len(f["messages"]) == before
    assert f["status"] == "TUTOR_UNAVAILABLE"
    assert fragment in g.s["last_error"]
    assert g.s["due_at"] is None
    g.command("next", {}, None, True)
    assert f["end_reason"] == "teacher_next"
    assert g.s["last_error"] is None


def test_stale_unavailable_job_does_not_touch_the_current_focus():
    g = focus_room()
    f = g.focus()
    before = (f["status"], len(f["messages"]), g.s["last_error"], g.s["due_at"])
    g.complete_job(
        "focused_tutor",
        "focus:stale:9",
        {"tutor_unavailable": "CLASSROOM_BUDGET_AVAILABILITY"},
        {},
    )
    assert (f["status"], len(f["messages"]), g.s["last_error"], g.s["due_at"]) == before


def test_focus_notice_is_exposed_only_while_the_tutor_is_paused():
    from app.run2.orchestrator import focus_notice

    g = focus_room()
    assert focus_notice(g.s) is None
    f = g.focus()
    g.complete_job(
        "focused_tutor", f["job_key"], {"tutor_unavailable": "OWNER_PROVIDER_PROFILE_REQUIRED"}, {}
    )
    assert "尚未設定 LLM" in focus_notice(g.s)
    g.command("next", {}, None, True)
    assert focus_notice(g.s) is None

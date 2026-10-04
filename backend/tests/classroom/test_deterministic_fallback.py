from app.run2.policy import majority_context
from app.run2.workers import deterministic_result

CURRENT = {
    "id": "q1",
    "title": "選擇",
    "scenario": "選擇與理由",
    "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
    "duration_seconds": 90,
}


def fallback(key):
    item = {"kind": "dynamic_question", "context": majority_context(CURRENT, {}, []), "key": key}
    return deterministic_result(item, "OWNER_PROVIDER_PROFILE_REQUIRED")


def test_dynamic_question_fallback_is_a_new_question_not_the_current_one():
    result, audit = fallback("next:run-1:0")
    question = result["question"]
    assert question["id"] != CURRENT["id"]
    assert question["title"] != CURRENT["title"]
    assert audit["provider"] == "deterministic-question"
    assert audit["fallback_used"] is True


def test_each_regeneration_gets_its_own_question_id():
    first, _ = fallback("next:run-1:0")
    second, _ = fallback("next:run-1:1")
    other_run, _ = fallback("next:run-2:0")
    ids = {first["question"]["id"], second["question"]["id"], other_run["question"]["id"]}
    assert len(ids) == 3

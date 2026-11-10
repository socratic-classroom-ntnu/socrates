"""Language and citation checks in guarded_generate (PROMPT-DESIGN §2, §5)."""

import asyncio

import pytest

from app.modules.llm_runtime import iron_rules
from app.modules.llm_runtime.contracts import Citation
from app.modules.llm_runtime.service import IronRuleCheckFailed, locate_citation

CONTEXT = {
    "output_locale": "zh-TW",
    "student_messages": [
        {"ref": "m1", "text": "五個人比較多，所以我會拉。"},
        {"ref": "m3", "text": "I would never push him myself."},
    ],
}


def summary(*sources, reasoning="你以行為本身判斷對錯。"):
    return {
        "points": [{"text": "你在意誰動手。", "sources": list(sources)}],
        "trajectory": [],
        "final_position": "你不會主動犧牲一個人。",
        "reasoning_style": reasoning,
        "open_question": "",
        "normalized_text": "Student cares about who acts.",
    }


def run(*results, context=CONTEXT, kind="final_summary"):
    calls = []

    async def fake(binding, messages, schema, on_delta):
        calls.append(messages)
        return results[min(len(calls), len(results)) - 1], {"latency_ms": 1}

    async def no_delta(_):
        return None

    out = asyncio.run(
        iron_rules.guarded_generate(
            {}, [], None, no_delta, kind=kind, context=context, generate=fake
        )
    )
    return out, calls


@pytest.mark.parametrize(
    ("text", "locale", "expected"),
    [
        ("你認為親手做比較嚴重。", "zh-TW", True),
        ("You think acting yourself is worse.", "zh-TW", False),
        ("You think acting yourself is worse.", "en", True),
        ("你認為親手做比較嚴重。", "en", False),
        ("あなたは自分で押すのは違うと思う。", "ja", True),
        ("你認為親手做比較嚴重。", "tlh", True),
        ("……", "zh-TW", True),
    ],
)
def test_in_locale(text, locale, expected):
    assert iron_rules.in_locale(text, locale) is expected


def test_quotes_and_enum_values_do_not_count_against_the_locale():
    """An English quote and English normalized_text inside a Chinese summary still pass."""
    (result, audit), calls = run(summary({"message_ref": "m3", "quote": "never push him"}))
    assert len(calls) == 1 and audit["iron_rules"]["outcome"] == "pass"


def test_wrong_language_is_regenerated_then_a_typed_error():
    english = summary({"message_ref": "m1", "quote": "五個人比較多"}, reasoning="You judge acts.")
    english["final_position"] = "You would not sacrifice anyone yourself."
    with pytest.raises(IronRuleCheckFailed) as failed:
        run(english, english)
    assert failed.value.reason == "WRONG_LANGUAGE"


def test_no_locale_means_no_language_check():
    english = summary({"message_ref": "m1", "quote": "五個人比較多"}, reasoning="You judge acts.")
    english["final_position"] = "You would not sacrifice anyone yourself."
    (_, audit), _ = run(english, context={"student_messages": CONTEXT["student_messages"]})
    assert audit["iron_rules"]["outcome"] == "pass"


def test_invalid_citations_are_dropped_and_valid_ones_kept():
    valid = {"message_ref": "m1", "quote": "五個人比較多"}
    reworded = {"message_ref": "m1", "quote": "六個人比較多"}
    wrong_message = {"message_ref": "m3", "quote": "五個人比較多"}
    other_student = {"message_ref": "m9", "quote": "五個人比較多"}
    (result, _), calls = run(summary(valid, reworded, wrong_message, other_student))
    assert result["points"][0]["sources"] == [valid]
    assert len(calls) == 1


def test_no_valid_citation_is_regenerated_once_then_a_typed_error():
    invented = summary({"message_ref": "m1", "quote": "我其實不想拉"})
    grounded = summary({"message_ref": "m1", "quote": "我會拉"})
    (result, audit), calls = run(invented, grounded)
    assert len(calls) == 2 and audit["iron_rules"]["outcome"] == "regenerated"
    assert "NO_VALID_CITATION" in calls[1][0]["content"]
    with pytest.raises(IronRuleCheckFailed) as failed:
        run(invented, invented)
    assert failed.value.reason == "NO_VALID_CITATION"


def test_locate_citation_gives_code_point_offsets():
    text = "我覺得🙂五個人比較多"
    located = locate_citation(Citation(message_ref="m1", quote="五個人"), "msg-1", text)
    assert located is not None and text[located.start : located.end] == "五個人"
    assert located.message_id == "msg-1"
    assert locate_citation(Citation(message_ref="m1", quote="六個人"), "msg-1", text) is None

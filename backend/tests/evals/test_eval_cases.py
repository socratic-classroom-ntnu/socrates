"""The eval set and its scorer, checked offline: no provider is called here."""

import asyncio
from collections import Counter
from typing import get_args

from sqlalchemy.orm import Session

from app.modules.llm_runtime.contracts import SoloFlags, SoloTutorTurn
from app.modules.platform import storage
from tests.evals.run_evals import context, load, report, run_case, score

SPEC = load()
CASES = SPEC["cases"]
MOVES = set(get_args(SoloTutorTurn.model_fields["move"].annotation))
CATEGORIES = {
    "一般作答",
    "強理由",
    "敷衍",
    "離題",
    "惡意離題",
    "提到自殺",
    "指令覆寫",
    "改變立場",
    "多語",
}


def test_thirty_cases_cover_every_category():
    assert len(CASES) == 30
    assert len({c["id"] for c in CASES}) == 30
    counts = Counter(c["category"] for c in CASES)
    assert set(counts) == CATEGORIES and min(counts.values()) >= 3


def test_every_case_is_labelled_with_real_flags_moves_and_checks():
    for case in CASES:
        assert case["on"] and set(case["on"]) | set(case["off"]) <= set(SoloFlags.model_fields)
        assert not set(case["on"]) & set(case["off"]), case["id"]
        assert case["moves"] and set(case["moves"]) <= MOVES, case["id"]
        assert case.get("check") in (None, "pull_back", "refer_teacher"), case["id"]


def test_context_numbers_the_students_own_messages():
    case = next(c for c in CASES if c["id"] == "change-push")
    ctx = context(SPEC, case)
    assert [m["ref"] for m in ctx["student_messages"]] == ["m1", "m2"]
    assert ctx["student_messages"][0]["text"] == case["answer"] and ctx["turn_index"] == 1


def test_a_reply_that_meets_every_label_scores_full_marks():
    case = next(c for c in CASES if c["id"] == "off-conan")
    result = {
        "reply_text": "這個先放一邊。回到電車：你覺得人數重要的理由是什麼？",
        "move": "probe",
        "flags": {f: int(f in case["on"]) for f in SoloFlags.model_fields},
        "summary": {"sources": [{"message_ref": "m1", "quote": "柯南的反派"}]},
    }
    row = score(case, result, True, context(SPEC, case))
    assert row == {
        "id": "off-conan",
        "category": "離題",
        "schema": True,
        "move": True,
        "flags": 1.0,
        "check": True,
        "language": True,
        "citations": 1.0,
        "leaked": False,
    }


def test_the_harness_runs_end_to_end_with_a_fake_provider():
    async def fake(binding, messages, schema, on_delta):
        reply = {"reply_text": "回到這一題：你的理由是什麼？", "move": "probe", "guard": "on_topic"}
        return reply, {"latency_ms": 1}

    engine = storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with Session(engine) as db:
        rows = [asyncio.run(run_case(SPEC, case, {}, db, generate=fake)) for case in CASES[:3]]
    assert [r["schema"] for r in rows] == [False] * 3  # the fake omits required fields
    assert all(r["flags"] is None for r in rows)
    assert "flag 一致率 | n/a" in report(rows)

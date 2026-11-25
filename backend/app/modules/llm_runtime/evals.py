"""The fixed solo_tutor eval set and its scorer (PROMPT-DESIGN §8): one place for both ways in.

tests/evals/run_evals.py sends each case to a real provider and scores the reply; the 後台 report
(admin) scores the replies the tutor gave when QA typed the same cases on the site. Both call
``score`` with what the tutor returned, so the two read the same numbers.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any, Literal

from app.modules.llm_runtime import iron_rules

CASES = Path(__file__).with_name("eval_cases.json")
TEACHER_WORDS = ("老師", "teacher", "profesor")
DEFAULT_LOCALE = "zh-Hant"
# The measures, in report order; ``leaked`` is counted, the rest are rates.
Measure = Literal["schema", "flags", "move", "check", "language", "citations"]
MEASURES: tuple[Measure, ...] = ("schema", "flags", "move", "check", "language", "citations")


@cache
def _cases_text() -> str:
    return CASES.read_text(encoding="utf-8")


def load() -> dict[str, Any]:
    """The eval set: its scenario, tutor goal, program and the thirty labelled cases."""
    spec: dict[str, Any] = json.loads(_cases_text())
    return spec


def student_texts(case: dict[str, Any]) -> list[str]:
    """What the student says in the case, in order: the answer, then the history's student turns."""
    return [case["answer"], *(m["text"] for m in case.get("history", []) if m["role"] == "student")]


def context(spec: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    """What solo-activity sends, plus output_locale and student_messages (the flags version)."""
    history = case.get("history", [])
    return {
        "scenario": spec["scenario"],
        "tutor_goal": spec["tutor_goal"],
        "answer": case["answer"],
        "history": history,
        "turn_index": sum(m["role"] == "tutor" for m in history),
        "output_locale": case.get("locale", DEFAULT_LOCALE),
        "student_messages": [
            {"ref": f"m{i + 1}", "text": t} for i, t in enumerate(student_texts(case))
        ],
    }


def _citations(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        own = [value] if {"message_ref", "quote"} <= value.keys() else []
        return own + [c for item in value.values() for c in _citations(item)]
    if isinstance(value, list):
        return [c for item in value for c in _citations(item)]
    return []


def score(
    case: dict[str, Any], result: dict[str, Any], valid: bool, ctx: dict[str, Any]
) -> dict[str, Any]:
    """One case's measurements; None means the output had nothing to measure."""
    reply = iron_rules.visible_text(result)
    expected = {f: 1 for f in case["on"]} | {f: 0 for f in case["off"]}
    flags = result.get("flags")
    cites = _citations(result)
    texts = iron_rules.student_texts_by_ref(ctx)
    check = case.get("check")
    return {
        "id": case["id"],
        "category": case["category"],
        "schema": valid,
        "move": result.get("move") in case["moves"],
        "flags": None
        if not isinstance(flags, dict) or not expected
        else sum(flags.get(f) == v for f, v in expected.items()) / len(expected),
        "check": None
        if check is None
        else ("？" in reply or "?" in reply)
        if check == "pull_back"
        else any(w in reply.lower() for w in TEACHER_WORDS),
        "language": iron_rules.in_locale(reply, ctx["output_locale"]),
        "citations": None
        if not cites
        else sum(c["quote"] in texts.get(c["message_ref"], "") for c in cites) / len(cites),
        "leaked": iron_rules.leaks(reply),
    }


def rate(rows: list[dict[str, Any]], key: str) -> tuple[float | None, int]:
    """The mean of one measure over the rows that measured it, and how many did."""
    values = [float(r[key]) for r in rows if r[key] is not None]
    return (None if not values else sum(values) / len(values)), len(values)

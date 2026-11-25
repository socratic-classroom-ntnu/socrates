"""Student metrics from the tutor's flags: the one place they are defined (PROMPT-DESIGN §4).

Pure functions over plain data, so the solo activity's progress and the group class's analysis
compute the same numbers. The population is every student message of an attempt that the tutor
judged (it carries ten 0/1 flags); the recent window is the last RECENT of them. These are
reference indicators for the teacher, not scores, and the student never sees them.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal, TypedDict

RECENT = 5
# A trend is shown only when the recent window and the whole differ by more than this.
TREND_THRESHOLD = 10.0
# 思考深度 gains this much when the tutor found the student's reason tested at least once.
REASON_TESTED_BONUS = 10.0
MARKS = ("danger_tendency", "malicious_off_topic")

Trend = Literal["up", "down"] | None


class Judged(TypedDict):
    """One student message the tutor judged: its id and the ten flags (0 or 1)."""

    message_id: str
    flags: dict[str, int]


def _share(messages: Sequence[Judged], flag: str) -> float:
    return sum(m["flags"][flag] for m in messages) / len(messages)


def _ids(messages: Sequence[Judged], *flags: str) -> list[str]:
    """The messages that hold the metric up: those with any of its flags at 1."""
    return [m["message_id"] for m in messages if any(m["flags"][flag] for flag in flags)]


def _trend(recent: float, whole: float) -> Trend:
    if recent - whole > TREND_THRESHOLD:
        return "up"
    if whole - recent > TREND_THRESHOLD:
        return "down"
    return None


def _engagement(messages: Sequence[Judged]) -> float:
    return 100 * (
        0.6 * (1 - _share(messages, "low_effort")) + 0.4 * _share(messages, "built_on_tutor")
    )


def _depth(messages: Sequence[Judged], bonus: float) -> float:
    parts = ("gave_reason", "used_example", "considered_counterpoint", "self_corrected")
    mean = sum(sum(m["flags"][p] for p in parts) / len(parts) for m in messages) / len(messages)
    return min(100.0, 100 * mean + bonus)


def _metric(value: float, recent: float | None, ids: list[str]) -> dict[str, Any]:
    return {
        "value": round(value, 1),
        "trend": None if recent is None else _trend(recent, value),
        "message_ids": ids,
    }


def student_metrics(
    judged: Sequence[Judged], *, position_shifts: int, reason_tested: bool
) -> dict[str, Any]:
    """Metrics, marks and the messages behind them for one attempt.

    ``position_shifts`` counts the tutor turns that reported a change of position;
    ``reason_tested`` says whether any tutor turn found the student's reason tested.
    The metrics are None before the tutor has judged any message.
    """
    marks = [mark for mark in MARKS if any(m["flags"][mark] for m in judged)]
    mark_ids = _ids(judged, *MARKS)
    if not judged:
        return {
            "metrics": None,
            "marks": marks,
            "mark_message_ids": mark_ids,
        }
    recent = judged[-RECENT:]
    bonus = REASON_TESTED_BONUS if reason_tested else 0.0
    off_whole, off_recent = _share(judged, "off_topic"), _share(recent, "off_topic")
    distraction = 100 * (2 * off_recent + off_whole) / 3
    return {
        "metrics": {
            "engagement": _metric(
                _engagement(judged),
                _engagement(recent),
                _ids(judged, "low_effort", "built_on_tutor"),
            ),
            # The whole already leans on the recent window; its trend compares the window alone.
            "distraction": _metric(distraction, 100 * off_recent, _ids(judged, "off_topic")),
            "depth": _metric(
                _depth(judged, bonus),
                _depth(recent, bonus),
                _ids(
                    judged,
                    "gave_reason",
                    "used_example",
                    "considered_counterpoint",
                    "self_corrected",
                ),
            ),
            "initiative": _metric(
                100 * _share(judged, "asked_question"), None, _ids(judged, "asked_question")
            ),
            "position_shifts": position_shifts,
            "judged_messages": len(judged),
        },
        "marks": marks,
        "mark_message_ids": mark_ids,
    }

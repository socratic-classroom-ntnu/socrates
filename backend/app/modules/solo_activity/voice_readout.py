"""Voice mode: what Socrates reads out as the summary, and whether the student heard it.

The voice model does not compose the summary it reads: ``readout`` builds the words with a fixed
template from the candidate summary (the fields the typing card shows), the voice model is told to
read them word for word, and ``heard_as_read`` compares its transcript of what it actually said
with that text. A match is what lets a spoken "對" confirm the stored summary. Pure: no I/O.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Mapping, Sequence
from difflib import SequenceMatcher
from typing import Any

import opencc  # type: ignore[import-untyped]  # ships no type hints

# How close the transcript must be, after folding script, spaces and punctuation. Leaves room for
# a word or two misheard; a dropped clause, a cut-off readout or a rewording falls below it.
MATCH_RATIO = 0.9

_TEMPLATES: dict[str, dict[str, str]] = {
    "zh-Hant": {
        "intro": "我整理一下你目前的想法。",
        "position": "你的立場是：{}。",
        "reason": "理由是：{}。",
        "conditions": "你考慮的條件有：{}。",
        "joiner": "、",
        "question": "這樣整理對嗎？",
    },
    "zh-Hans": {
        "intro": "我整理一下你目前的想法。",
        "position": "你的立场是：{}。",
        "reason": "理由是：{}。",
        "conditions": "你考虑的条件有：{}。",
        "joiner": "、",
        "question": "这样整理对吗？",
    },
    "en": {
        "intro": "Let me sum up where you are now. ",
        "position": "Your position: {}. ",
        "reason": "Your reason: {}. ",
        "conditions": "The conditions you weighed: {}. ",
        "joiner": "; ",
        "question": "Is that right?",
    },
    "es": {
        "intro": "Déjame resumir lo que piensas ahora. ",
        "position": "Tu postura: {}. ",
        "reason": "Tu razón: {}. ",
        "conditions": "Las condiciones que tuviste en cuenta: {}. ",
        "joiner": "; ",
        "question": "¿Es correcto?",
    },
}
_DEFAULT_LOCALE = "zh-Hant"
_TO_SIMPLIFIED = opencc.OpenCC("t2s")


def _clause(text: str) -> str:
    """A field as said inside a sentence: without the full stop the model may have ended it on."""
    return text.strip().rstrip("。.！!？?；;")


def readout(summary: Mapping[str, Any], locale: str) -> str:
    """What Socrates says: the parts the card shows, in the student's language, then the question.

    ``unresolved_issue`` is not read because the card does not show it; empty parts are left out.
    """
    t = _TEMPLATES.get(locale, _TEMPLATES[_DEFAULT_LOCALE])
    parts = [t["intro"], t["position"].format(_clause(summary["current_position"]))]
    parts.append(t["reason"].format(_clause(summary["reason_summary"])))
    conditions = [_clause(c) for c in summary.get("relevant_conditions") or [] if c.strip()]
    if conditions:
        parts.append(t["conditions"].format(t["joiner"].join(conditions)))
    note = (summary.get("principle_note") or "").strip()
    if note:
        parts.append(
            note if note[-1] in "。.！!？?" else note + ("。" if t["joiner"] == "、" else ". ")
        )
    parts.append(t["question"])
    return "".join(parts)


def _fold(text: str) -> str:
    """Compare letters only: one script, no spaces or punctuation, one case."""
    simplified = _TO_SIMPLIFIED.convert(unicodedata.normalize("NFKC", text))
    return "".join(ch for ch in simplified.casefold() if unicodedata.category(ch)[0] in "LN")


def _covered(part: str, got: str) -> float:
    """Share of ``part``'s letters found, in order, in the transcript."""
    blocks = SequenceMatcher(None, part, got, autojunk=False).get_matching_blocks()
    return sum(b.size for b in blocks) / len(part)


def heard_as_read(expected: str, transcript: str, parts: Sequence[str] = ()) -> bool:
    """Whether the voice model's transcript of its speech is the readout, word for word.

    ``parts`` are the summary's own texts (position, reason, conditions): each must be in the
    transcript too, so a short clause dropped from a long summary is not lost in the overall ratio.
    """
    want, got = _fold(expected), _fold(transcript)
    if not want or not got:
        return False
    if SequenceMatcher(None, want, got, autojunk=False).ratio() < MATCH_RATIO:
        return False
    folded = [p for p in (_fold(part) for part in parts) if p]
    return all(_covered(p, got) >= MATCH_RATIO for p in folded)


def summary_parts(summary: Mapping[str, Any]) -> list[str]:
    """The texts of a summary that the readout must carry whole."""
    conditions = [c for c in summary.get("relevant_conditions") or [] if c.strip()]
    return [summary["current_position"], summary["reason_summary"], *conditions]

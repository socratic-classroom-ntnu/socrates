"""Voice mode: what Socrates reads out as a summary, and whether the student heard it.

The voice model does not compose the summary it reads: ``readout`` (a scenario's candidate summary)
and ``final_readout`` (the final summary) build the words with a fixed template from the fields the
typing card shows, and the voice model is told to read them. ``heard_as_read`` compares its
transcript of what it actually said with that text: a match settles that the student heard the
summary. A reworded reading is not refused here; whether it kept the meaning is judged with the
student's answer (voice_judge). ``to_script`` puts a transcript in the student's script. Pure.
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
        "final_intro": "我把整段討論整理一下。",
        "step": "一開始你認為：{}。",
        "shift": "後來{}，你認為：{}。",
        "final_position": "你最後的立場是：{}。",
        "style": "{}",
    },
    "zh-Hans": {
        "intro": "我整理一下你目前的想法。",
        "position": "你的立场是：{}。",
        "reason": "理由是：{}。",
        "conditions": "你考虑的条件有：{}。",
        "joiner": "、",
        "question": "这样整理对吗？",
        "final_intro": "我把整段讨论整理一下。",
        "step": "一开始你认为：{}。",
        "shift": "后来{}，你认为：{}。",
        "final_position": "你最后的立场是：{}。",
        "style": "{}",
    },
    "en": {
        "intro": "Let me sum up where you are now. ",
        "position": "Your position: {}. ",
        "reason": "Your reason: {}. ",
        "conditions": "The conditions you weighed: {}. ",
        "joiner": "; ",
        "question": "Is that right?",
        "final_intro": "Let me sum up the whole discussion. ",
        "step": "At first you thought: {}. ",
        "shift": "Then, {}, you thought: {}. ",
        "final_position": "Where you ended up: {}. ",
        "style": "{} ",
    },
    "es": {
        "intro": "Déjame resumir lo que piensas ahora. ",
        "position": "Tu postura: {}. ",
        "reason": "Tu razón: {}. ",
        "conditions": "Las condiciones que tuviste en cuenta: {}. ",
        "joiner": "; ",
        "question": "¿Es correcto?",
        "final_intro": "Déjame resumir toda la conversación. ",
        "step": "Al principio pensabas: {}. ",
        "shift": "Después, {}, pensaste: {}. ",
        "final_position": "Tu postura final: {}. ",
        "style": "{} ",
    },
}
_DEFAULT_LOCALE = "zh-Hant"
_TO_SIMPLIFIED = opencc.OpenCC("t2s")
_TO_TAIWAN = opencc.OpenCC("s2tw")
# Speech recognition has no Taiwan Mandarin: transcripts come back in simplified characters.
_SCRIPT = {"zh-Hant": _TO_TAIWAN}


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


def _sentence(text: str, t: Mapping[str, str]) -> str:
    text = text.strip()
    if not text or text[-1] in "。.！!？?":
        return text
    return text + ("。" if t["joiner"] == "、" else ". ")


def final_readout(final: Mapping[str, Any], locale: str) -> str:
    """The final summary as said: how the student's position moved, where it ended, then the
    question. Points and open questions stay on the card; the trajectory is the line of thought."""
    t = _TEMPLATES.get(locale, _TEMPLATES[_DEFAULT_LOCALE])
    parts = [t["final_intro"]]
    for index, step in enumerate(final.get("trajectory") or []):
        position = _clause(step["position"])
        shift = _clause(step.get("shift_reason") or "")
        if index and shift:
            parts.append(t["shift"].format(shift, position))
        else:
            parts.append(t["step"].format(position))
    parts.append(t["final_position"].format(_clause(final["final_position"])))
    style = _sentence(final.get("reasoning_style") or "", t)
    if style:
        parts.append(t["style"].format(style))
    parts.append(t["question"])
    return "".join(parts)


def final_parts(final: Mapping[str, Any]) -> list[str]:
    """The texts of a final summary that its readout must carry whole."""
    steps = [step["position"] for step in final.get("trajectory") or []]
    return [*steps, final["final_position"]]


def to_script(text: str, locale: str) -> str:
    """A transcript in the student's script: Taiwan traditional characters for zh-Hant."""
    convert = _SCRIPT.get(locale)
    return convert.convert(text) if convert is not None else text


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


def says(text: str, words: str) -> bool:
    """Whether ``words`` appear in ``text``, ignoring script, spaces and punctuation."""
    folded = _fold(words)
    return bool(folded) and folded in _fold(text)


def summary_parts(summary: Mapping[str, Any]) -> list[str]:
    """The texts of a summary that the readout must carry whole."""
    conditions = [c for c in summary.get("relevant_conditions") or [] if c.strip()]
    return [summary["current_position"], summary["reason_summary"], *conditions]

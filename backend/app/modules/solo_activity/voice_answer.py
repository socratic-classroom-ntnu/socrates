"""Voice mode: what kind of answer the student gave to "這樣整理對嗎？".

Rules, not a model: answers are short, and a wrong "agree" would store a summary the student never
accepted, so only a plain yes counts as one. A yes followed by anything of substance is an
addition, a no is disagreement, hedges and silence are unclear, and any other content is treated
as an addition (the student is saying something new). Pure: no I/O.
"""

from __future__ import annotations

import re
import unicodedata

import opencc  # type: ignore[import-untyped]  # ships no type hints

from app.modules.solo_activity.voice_confirmation import VoiceAnswer

_TO_TRADITIONAL = opencc.OpenCC("s2t")

# Sounds that carry no answer of their own.
_FILLERS = {"嗯", "嗯嗯", "喔", "哦", "噢", "啊", "欸", "呃", "um", "uh", "eh", "oh", "well", "ah"}
_AGREE = {
    "對",
    "對啊",
    "對呀",
    "對的",
    "對喔",
    "是",
    "是的",
    "是啊",
    "沒錯",
    "正確",
    "可以",
    "沒問題",
    "嗯對",
    "yes",
    "yeah",
    "yep",
    "yup",
    "right",
    "that's right",
    "thats right",
    "correct",
    "exactly",
    "sure",
    "true",
    "that's it",
    "sí",
    "si",
    "exacto",
    "correcto",
    "claro",
    "así es",
    "eso es",
}
_HEDGES = {
    "應該",
    "應該吧",
    "大概",
    "大概吧",
    "還好",
    "可能",
    "可能吧",
    "也許",
    "或許",
    "差不多",
    "差不多吧",
    "我不知道",
    "不知道",
    "不確定",
    "我不確定",
    "好像",
    "好像吧",
    "算是吧",
    "還行",
    "hmm",
    "hm",
    "mm",
    "maybe",
    "perhaps",
    "i guess",
    "not sure",
    "i don't know",
    "kind of",
    "sort of",
    "i think so",
    "quizás",
    "quizas",
    "tal vez",
    "no sé",
    "no se",
    "puede ser",
    "creo que sí",
}
_DISAGREE_PREFIXES = (
    "不對",
    "不是",
    "不太",
    "錯",
    "也不是",
    "不完全",
    "並不",
    "不行",
    "不同意",
    "no",
    "not",
    "nope",
    "wrong",
    "incorrect",
)


def _clauses(text: str, locale: str) -> list[str]:
    folded = unicodedata.normalize("NFKC", text).casefold()
    if locale.startswith("zh") or not locale:
        folded = _TO_TRADITIONAL.convert(folded)
    # Every mark that is not part of a word ends a clause; an apostrophe stays inside one.
    marked = "".join(
        ch if unicodedata.category(ch)[0] in "LN" or ch in "' " else "," for ch in folded
    )
    parts = [re.sub(r"\s+", " ", p).strip() for p in marked.split(",")]
    return [p for p in parts if p and p not in _FILLERS]


def _yes_word(clause: str) -> str | None:
    """The yes word a clause starts with, or None. Repeats ("對對對") count as one."""
    for word in sorted(_AGREE, key=len, reverse=True):
        if clause.startswith(word):
            return word
    return None


def _all_yes(clause: str) -> bool:
    rest = clause
    while rest:
        word = _yes_word(rest)
        if word is None:
            return False
        rest = rest[len(word) :].strip()
    return True


def classify(text: str, locale: str) -> VoiceAnswer:
    clauses = _clauses(text, locale)
    if not clauses or all(c in _HEDGES for c in clauses):
        return "unclear"
    first = clauses[0]
    if first in _HEDGES:
        return "unclear" if all(c in _HEDGES or _all_yes(c) for c in clauses) else "addition"
    if any(
        first == p or first.startswith(p + " ") or (not p.isascii() and first.startswith(p))
        for p in _DISAGREE_PREFIXES
    ):
        return "disagree"
    if _yes_word(first) is None:
        return "addition"
    if not _all_yes(first):
        return "addition"
    return "agree" if all(_all_yes(c) for c in clauses[1:]) else "addition"

"""Voice mode: sorting the student's spoken answer to "這樣整理對嗎？".

Rules, not a model: the answer is short and the cost of a wrong "agree" is a summary the student
never accepted, so anything that is not a plain yes is not a yes. A yes followed by anything of
substance ("對，但我想補充…") is an addition; hedges ("嗯", "應該吧") are unclear.
"""

import pytest

from app.modules.solo_activity.voice_answer import classify


@pytest.mark.parametrize(
    "text",
    [
        "對",
        "對。",
        "對啊",
        "對對對",
        "是",
        "是的",
        "沒錯",
        "嗯，對",
        "對，沒錯",
        "正確",
        "可以",
        "对的",
        "沒問題",
    ],
)
def test_a_plain_yes_is_agreement(text):
    assert classify(text, "zh-Hant") == "agree"


@pytest.mark.parametrize(
    "text",
    [
        "對，但我想補充一下",
        "對，不過還有一點",
        "是，可是如果那個人是自願的呢",
        "對，另外我覺得",
        "沒錯，然後還有",
    ],
)
def test_a_yes_with_more_to_say_is_an_addition(text):
    assert classify(text, "zh-Hant") == "addition"


def test_a_yes_followed_by_any_new_content_is_an_addition():
    assert classify("對，而且我覺得他應該先問那個人", "zh-Hant") == "addition"


@pytest.mark.parametrize(
    "text", ["不對", "不是", "不太對", "錯了", "不是這樣", "不對，我是說後果比較重要", "也不是"]
)
def test_a_no_is_disagreement(text):
    assert classify(text, "zh-Hant") == "disagree"


@pytest.mark.parametrize(
    "text", ["嗯", "嗯……", "應該吧", "大概吧", "還好", "可能", "我不知道", "差不多吧", ""]
)
def test_hedges_and_silence_are_unclear(text):
    assert classify(text, "zh-Hant") == "unclear"


def test_simplified_transcripts_are_read_the_same():
    assert classify("对，没错", "zh-Hant") == "agree"
    assert classify("不对", "zh-Hant") == "disagree"
    assert classify("对，但是我想补充", "zh-Hant") == "addition"


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("Yes", "agree"),
        ("yeah, that's right", "agree"),
        ("Exactly.", "agree"),
        ("Yes, but I'd add one thing", "addition"),
        ("No", "disagree"),
        ("not really", "disagree"),
        ("maybe", "unclear"),
        ("hmm", "unclear"),
    ],
)
def test_english(text, kind):
    assert classify(text, "en") == kind


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("Sí", "agree"),
        ("sí, exacto", "agree"),
        ("sí, pero", "addition"),
        ("No", "disagree"),
        ("quizás", "unclear"),
    ],
)
def test_spanish(text, kind):
    assert classify(text, "es") == kind

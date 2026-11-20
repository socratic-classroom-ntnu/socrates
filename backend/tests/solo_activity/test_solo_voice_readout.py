"""Voice mode, step 2: the summary stored is the one the student heard.

The words Socrates reads are not composed by the voice model: the backend builds them with a fixed
template from the same candidate summary the typing card shows, and the voice model is told to
read them out word for word. What the student heard (the voice model's own transcript of its
speech) is then compared with that text. Only a match counts as heard in full; confirming then
stores exactly that candidate summary.

Gemini Live transcripts are often in simplified characters, sometimes with a space between every
character, and always punctuated differently, so the comparison ignores script, spaces and
punctuation; anything beyond a small slip in a word or two is a mismatch.
"""

import pytest

from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity import voice_readout as vr
from tests.solo_activity.test_solo_empty_summary import reply, tutor_turn
from tests.solo_activity.test_solo_state_table import in_dialogue

SUMMARY = {
    "current_position": "不該拉動拉桿",
    "reason_summary": "主動讓一個人死，跟沒救到五個人不一樣",
    "relevant_conditions": ["那一個人是無辜的", "沒有其他辦法"],
    "unresolved_issue": "如果是一百個人呢",
    "principle_note": "你看重的是行為本身，接近義務論",
}


def test_the_readout_says_the_fields_the_card_shows_and_asks_for_agreement():
    text = vr.readout(SUMMARY, "zh-Hant")
    assert text == (
        "我整理一下你目前的想法。你的立場是：不該拉動拉桿。"
        "理由是：主動讓一個人死，跟沒救到五個人不一樣。"
        "你考慮的條件有：那一個人是無辜的、沒有其他辦法。"
        "你看重的是行為本身，接近義務論。"
        "這樣整理對嗎？"
    )


def test_the_unresolved_issue_is_not_read_because_the_card_does_not_show_it():
    assert "一百個人" not in vr.readout(SUMMARY, "zh-Hant")


def test_parts_the_summary_does_not_have_are_left_out():
    bare = {**SUMMARY, "relevant_conditions": [], "principle_note": ""}
    assert vr.readout(bare, "zh-Hant") == (
        "我整理一下你目前的想法。你的立場是：不該拉動拉桿。"
        "理由是：主動讓一個人死，跟沒救到五個人不一樣。這樣整理對嗎？"
    )


@pytest.mark.parametrize("locale", ["zh-Hant", "zh-Hans", "en", "es"])
def test_every_student_language_has_a_readout_that_contains_the_summary(locale):
    text = vr.readout(SUMMARY, locale)
    assert SUMMARY["current_position"] in text and SUMMARY["reason_summary"] in text


def test_a_language_without_a_template_falls_back_to_traditional_chinese():
    assert vr.readout(SUMMARY, "fr") == vr.readout(SUMMARY, "zh-Hant")


# ---- heard as read ------------------------------------------------------------------------


def test_the_transcript_of_the_readout_word_for_word_is_heard_in_full():
    text = vr.readout(SUMMARY, "zh-Hant")
    assert vr.heard_as_read(text, text)


def test_simplified_characters_spaces_and_other_punctuation_do_not_matter():
    text = vr.readout(SUMMARY, "zh-Hant")
    heard = (
        "我 整 理 一 下 你 目 前 的 想 法 你的立场是 不该拉动拉杆 "
        "理由是 主动让一个人死 跟没救到五个人不一样 你考虑的条件有 那一个人是无辜的 "
        "没有其他办法 你看重的是行为本身 接近义务论 这样整理对吗"
    )
    assert vr.heard_as_read(text, heard)


def test_a_slip_in_one_word_still_counts_as_read():
    text = vr.readout(SUMMARY, "zh-Hant")
    assert vr.heard_as_read(text, text.replace("無辜", "無故"))


def test_a_reworded_summary_is_not_what_was_stored():
    text = vr.readout(SUMMARY, "zh-Hant")
    reworded = "所以你覺得不要拉，因為害死人比較嚴重，對吧？"
    assert not vr.heard_as_read(text, reworded)


def test_a_dropped_reason_is_not_what_was_stored():
    text = vr.readout(SUMMARY, "zh-Hant")
    dropped = text.replace("理由是：主動讓一個人死，跟沒救到五個人不一樣。", "")
    assert not vr.heard_as_read(text, dropped)


def test_a_short_condition_dropped_from_a_long_summary_is_caught_by_its_own_check():
    long = {
        **SUMMARY,
        "reason_summary": "主動讓一個人死，跟沒救到五個人不一樣；" * 6
        + "而且我不想當那個做決定的人",
        "relevant_conditions": ["無辜"],
    }
    text = vr.readout(long, "zh-Hant")
    dropped = text.replace("你考慮的條件有：無辜。", "")
    assert vr.heard_as_read(text, dropped)  # the overall ratio alone lets it through
    assert not vr.heard_as_read(text, dropped, vr.summary_parts(long))
    assert vr.heard_as_read(text, text, vr.summary_parts(long))


def test_a_readout_cut_off_halfway_is_not_heard_in_full():
    text = vr.readout(SUMMARY, "zh-Hant")
    assert not vr.heard_as_read(text, text[: len(text) // 2])


def test_an_empty_transcript_is_not_heard():
    assert not vr.heard_as_read(vr.readout(SUMMARY, "zh-Hant"), "")


def test_english_ignores_case_and_punctuation():
    text = vr.readout(SUMMARY, "en")
    assert vr.heard_as_read(text, text.lower().replace(".", "").replace(":", ""))


# ---- what confirming stores ---------------------------------------------------------------


def test_confirming_what_was_read_stores_the_summary_the_readout_was_built_from():
    a = reply(in_dialogue(), tutor_turn())
    read = vr.readout(a.current.candidate_summary, "zh-Hant")
    assert vr.heard_as_read(read, read)
    b = sm.confirm_viewpoint(a, a.current.summary_digest)
    stored = b.progress[0].confirmed_summary
    assert stored == a.current.candidate_summary
    assert vr.readout(stored, "zh-Hant") == read

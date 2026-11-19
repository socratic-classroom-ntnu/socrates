import pytest

from tendencies import InvalidTendencies, number_messages, validate_tendencies

REFS = {
    "m1": ("id-1", "我會拉，五個人比一個人多。"),
    "m2": ("id-2", "推人很怪 😅 我做不到。"),
}


def tendency(name="結果導向", strength=3, quotes=(("m1", "五個人比一個人多"),)):
    return {
        "name": name,
        "strength": strength,
        "reading": "他用人數來判斷。",
        "quotes": [{"message_ref": ref, "quote": quote} for ref, quote in quotes],
    }


def reply(*items):
    return {"tendencies": list(items)}


def three(**first):
    return reply(tendency(**first), tendency("情感", 2), tendency("動手的負擔", 1))


def test_messages_are_numbered_across_both_scenarios_in_order():
    assert number_messages([["甲", "乙"], ["丙"]]) == [("m1", "甲"), ("m2", "乙"), ("m3", "丙")]


def test_a_valid_reply_keeps_every_tendency_with_located_quotes():
    result = validate_tendencies(three(), REFS)
    assert [t["name"] for t in result["tendencies"]] == ["結果導向", "情感", "動手的負擔"]
    (quote,) = result["tendencies"][0]["quotes"]
    assert quote == {"message_id": "id-1", "quote": "五個人比一個人多", "start": 4, "end": 12}
    assert result["dropped_quotes"] == 0
    assert result["dropped_tendencies"] == []


def test_quote_offsets_are_utf16_like_the_frontend():
    result = validate_tendencies(three(quotes=(("m2", "我做不到"),)), REFS)
    (quote,) = result["tendencies"][0]["quotes"]
    # The emoji is two UTF-16 code units.
    assert (quote["start"], quote["end"]) == (8, 12)


def test_a_quote_not_found_verbatim_is_dropped_and_counted():
    quotes = (("m1", "五個人比一個人多"), ("m1", "我從沒說過"), ("m9", "推人很怪"))
    result = validate_tendencies(three(quotes=quotes), REFS)
    assert len(result["tendencies"][0]["quotes"]) == 1
    assert result["dropped_quotes"] == 2


def test_a_tendency_left_with_no_quote_is_dropped():
    result = validate_tendencies(three(quotes=(("m1", "編出來的"),)), REFS)
    assert [t["name"] for t in result["tendencies"]] == ["情感", "動手的負擔"]
    assert result["dropped_tendencies"] == ["結果導向"]
    assert result["dropped_quotes"] == 1


@pytest.mark.parametrize("count", [2, 6])
def test_the_model_must_give_three_to_five_tendencies(count):
    items = [tendency(f"傾向{i}") for i in range(count)]
    with pytest.raises(InvalidTendencies):
        validate_tendencies(reply(*items), REFS)


@pytest.mark.parametrize("strength", [-1, 5, 2.5, "3"])
def test_strength_must_be_a_whole_number_from_zero_to_four(strength):
    with pytest.raises(InvalidTendencies):
        validate_tendencies(three(strength=strength), REFS)


@pytest.mark.parametrize("quotes", [(), tuple(("m1", "五個人") for _ in range(4))])
def test_each_tendency_gives_one_to_three_quotes(quotes):
    with pytest.raises(InvalidTendencies):
        validate_tendencies(three(quotes=quotes), REFS)


def test_a_reply_missing_fields_is_invalid():
    with pytest.raises(InvalidTendencies):
        validate_tendencies({"tendencies": [{"name": "x"}] * 3}, REFS)

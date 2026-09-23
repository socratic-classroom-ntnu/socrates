import pytest
from app.run2.provider import partial_reply, fallback
from app.run2.realtime import RealtimeBus
from app.run2.contracts import TutorTurn, SummaryResult


@pytest.mark.parametrize(
    "raw,expected",
    [
        ('{"reply_text":"你好', "你好"),
        ('{"reply_text":"你好\\n世界"', "你好\n世界"),
        ('{"reply_text":"\\u4f60\\u597d"', "你好"),
        ('{"observations":{}}', ""),
        ('{"reply_text":"test\\', "test"),
    ],
)
def test_partial_json(raw, expected):
    assert partial_reply(raw) == expected


def test_scripted_provider_records_actual_capability():
    x = fallback(
        {"question": {"probe_hints": ["請說明理由"]}, "argument": "我重視生命", "turn_index": 2}
    )
    assert TutorTurn.model_validate(x).reply_text == "請說明理由"
    assert not x["observations"]["reason_tested"]


@pytest.mark.asyncio
async def test_ephemeral_offset_dedup():
    b = RealtimeBus()
    p = {
        "room": "r",
        "ephemeral": True,
        "type": "tutor.delta",
        "generation_id": "g",
        "offset": 0,
        "text": "你好",
    }
    await b.receive(p)
    await b.receive(p)
    assert b.buffers[("r", "g")] == "你好"
    await b.receive({**p, "offset": 2, "text": "世界"})
    assert b.buffers[("r", "g")] == "你好世界"
    b.close_generation("r", "g")
    assert ("r", "g") not in b.buffers
    await b.receive(p)
    assert ("r", "g") not in b.buffers


def test_summary_schema_is_structured():
    assert SummaryResult.model_validate(
        {"text": "課堂觀點", "key_points": ["理由"]}
    ).key_points == ["理由"]

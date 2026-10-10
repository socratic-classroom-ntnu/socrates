from app.api.transcript_schemas import TranscriptDraftCreate


def test_transcript_create_defaults() -> None:
    value = TranscriptDraftCreate(text="我會先保護最重要的人")
    assert value.adapter == "browser-speech"
    assert value.locale == "zh-TW"

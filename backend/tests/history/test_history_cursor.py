import uuid
from datetime import datetime, timezone

from app.repositories.history_repository import decode_cursor, encode_cursor


def test_cursor_round_trip() -> None:
    started = datetime(2026, 9, 21, 12, 30, tzinfo=timezone.utc)
    session_id = uuid.uuid4()
    value = encode_cursor(1, started, session_id)
    assert decode_cursor(value) == (1, started, session_id)

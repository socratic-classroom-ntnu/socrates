"""A refused voice connection says why (QA 11/22: out of time showed 「語音服務出錯了」).

The socket is accepted first, so the browser receives the reason and the close code; closing before
accepting only gives the browser a bare failure.
"""

import pytest
from fastapi import WebSocketDisconnect

from app.modules.platform import storage, toggles
from app.modules.platform.config import settings
from app.modules.solo_activity import voice_relay as vr
from tests.solo_activity.test_solo_attempts_api import ok, setup, start

ORIGIN = {"Origin": "http://testserver"}


@pytest.fixture
def voice_on(client, monkeypatch):
    monkeypatch.setattr(settings, "voice_gemini_api_key", "test-voice-key")
    with storage.transaction() as db:
        toggles.set_toggle(db, "voice_mode", True, "admin", 0.0)


def connect(client, attempt_id):
    return client.websocket_connect(f"/api/v2/solo/attempts/{attempt_id}/voice", headers=ORIGIN)


def test_out_of_time_says_the_time_is_used_up(client, tutor, voice_on, monkeypatch):
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    monkeypatch.setattr(settings, "voice_daily_seconds", 0)
    with connect(client, attempt["id"]) as ws:
        assert ws.receive_json() == {
            "type": "to_typing",
            "reason": "quota",
            "text": vr.TO_TYPING_TEXT["quota"],
        }
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4409


def test_switched_off_says_voice_mode_is_off(client, tutor, voice_on):
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    with storage.transaction() as db:
        toggles.set_toggle(db, "voice_mode", False, "admin", 0.0)
    with connect(client, attempt["id"]) as ws:
        assert ws.receive_json()["reason"] == "disabled"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4403


def test_someone_elses_attempt_is_closed_without_a_reason(client, tutor, voice_on):
    setup(client)
    with connect(client, "not-an-attempt") as ws:
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code in (4403, 4409)

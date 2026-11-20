"""Voice mode, step 5: the switch, the key, and each student's daily voice time.

The entry shows only when the 後台 switch is on and the voice key is set; the switch is off by
default. Voice time adds up over a day, starts again at midnight Asia/Taipei, and the limit is
read from platform config (the one place voice settings are read).
"""

from datetime import datetime

import pytest

from app.modules.platform import storage, toggles
from app.modules.platform.config import settings
from app.modules.solo_activity import voice_usage
from tests.course_management.conftest import user

# 2026-11-20 23:50 and 2026-11-21 00:10, Asia/Taipei.
BEFORE_MIDNIGHT = datetime(2026, 11, 20, 23, 50, tzinfo=voice_usage.TAIPEI).timestamp()
AFTER_MIDNIGHT = datetime(2026, 11, 21, 0, 10, tzinfo=voice_usage.TAIPEI).timestamp()


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setattr(settings, "voice_gemini_api_key", "test-voice-key")


def _features():
    with storage.transaction() as db:
        return toggles.features(db)


def _switch(on):
    with storage.transaction() as db:
        toggles.set_toggle(db, "voice_mode", on, "admin", 0.0)


def test_voice_mode_is_off_by_default(client, key):
    assert toggles.DB_TOGGLES["voice_mode"].default is False
    assert _features()["voice_mode"] is False


def test_the_entry_shows_only_when_switched_on_and_the_key_is_set(client, monkeypatch):
    _switch(True)
    monkeypatch.setattr(settings, "voice_gemini_api_key", "")
    assert _features()["voice_mode"] is False
    monkeypatch.setattr(settings, "voice_gemini_api_key", "test-voice-key")
    assert _features()["voice_mode"] is True
    _switch(False)
    assert _features()["voice_mode"] is False


def test_the_public_config_carries_the_entry_flag(client, key):
    _switch(True)
    assert client.get("/api/v2/public-config").json()["features"]["voice_mode"] is True


def _student(client):
    user(client, "voicer")
    from sqlalchemy import select

    from app.modules.identity_access.repositories import Account

    with storage.transaction() as db:
        return db.scalar(select(Account).where(Account.username == "voicer")).id


def test_voice_time_adds_up_within_a_day(client):
    account_id = _student(client)
    with storage.transaction() as db:
        voice_usage.add(db, account_id, 120, BEFORE_MIDNIGHT - 3600)
        voice_usage.add(db, account_id, 60, BEFORE_MIDNIGHT)
        assert voice_usage.used(db, account_id, BEFORE_MIDNIGHT) == 180


def test_voice_time_starts_again_after_midnight_taipei(client):
    account_id = _student(client)
    with storage.transaction() as db:
        voice_usage.add(db, account_id, 300, BEFORE_MIDNIGHT)
        assert voice_usage.used(db, account_id, AFTER_MIDNIGHT) == 0
        assert voice_usage.taipei_day(BEFORE_MIDNIGHT) == "2026-11-20"
        assert voice_usage.taipei_day(AFTER_MIDNIGHT) == "2026-11-21"


def test_the_limit_comes_from_platform_config(client, monkeypatch):
    account_id = _student(client)
    monkeypatch.setattr(settings, "voice_daily_seconds", 600)
    with storage.transaction() as db:
        voice_usage.add(db, account_id, 550, BEFORE_MIDNIGHT)
        assert voice_usage.remaining(db, account_id, BEFORE_MIDNIGHT) == 50
        voice_usage.add(db, account_id, 100, BEFORE_MIDNIGHT)
        assert voice_usage.remaining(db, account_id, BEFORE_MIDNIGHT) == 0


def test_the_default_limit_is_fifteen_minutes():
    assert type(settings).model_fields["voice_daily_seconds"].default == 15 * 60

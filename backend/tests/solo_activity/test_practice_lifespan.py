"""啟動流程真的照 P30 串起來：先看資料庫，沒有可用的系統 AI 才讀環境變數。"""

import asyncio

import pytest
from sqlalchemy import func, select

from app import classroom_app
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import ProviderProfile
from app.modules.app_shell import llm_workers, practice_startup
from app.modules.platform import storage

KEY = "sk-or-v1-platform-key-0001"


@pytest.fixture
def start(client, monkeypatch):
    async def idle():
        return None

    for name in ("clock_loop", "mail_loop", "guest_expiry_loop", "feedback_purge_loop", "llm_loop"):
        monkeypatch.setattr(classroom_app, name, idle, raising=False)
        monkeypatch.setattr(llm_workers, name, idle, raising=False)
    monkeypatch.setattr(classroom_app.BUS, "listen", idle)
    monkeypatch.setattr(classroom_app.BUS, "sweep", idle)

    async def start_and_stop():
        async with classroom_app.lifespan(client.app):
            pass

    return lambda: asyncio.run(start_and_stop())


def set_env(monkeypatch, **values):
    for name in ("API_KEY", "MODEL", "ADAPTER", "BASE_URL"):
        monkeypatch.delenv(f"SOCRATES_PRACTICE_LLM_{name}", raising=False)
    for name, value in values.items():
        monkeypatch.setenv(f"SOCRATES_PRACTICE_LLM_{name}", value)


def profiles():
    with storage.transaction() as db:
        return db.scalars(select(ProviderProfile)).all()


def saved():
    practice_startup.prepare_practice(
        lambda: ai_service.platform_profile_config(
            {"SOCRATES_PRACTICE_LLM_API_KEY": KEY, "SOCRATES_PRACTICE_LLM_MODEL": "kept"}
        )
    )


def test_a_usable_connection_means_the_env_is_never_read(start, monkeypatch):
    saved()
    set_env(monkeypatch, API_KEY=KEY, ADAPTER="openroutr")  # broken
    calls = []
    real = ai_service.platform_profile_config
    monkeypatch.setattr(
        ai_service, "platform_profile_config", lambda *a: calls.append(1) or real(*a)
    )
    start()
    assert calls == []
    assert [p.default_model for p in profiles()] == ["kept"]


def test_a_broken_env_with_nothing_saved_stops_the_service(start, monkeypatch):
    set_env(monkeypatch, API_KEY=KEY, ADAPTER="openroutr")
    with pytest.raises(ValueError):
        start()


def test_an_empty_env_with_nothing_saved_writes_nothing(start, monkeypatch):
    set_env(monkeypatch)
    start()
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(ProviderProfile)) == 0


def test_an_env_with_nothing_saved_is_imported(start, monkeypatch):
    set_env(monkeypatch, API_KEY=KEY, MODEL="from-env")
    start()
    (profile,) = profiles()
    assert (profile.default_model, profile.enabled) == ("from-env", True)
    assert profile.metadata_json["updated_by_account_id"] == "deploy"


def test_a_disabled_row_is_enabled_again_by_the_env(start, monkeypatch):
    saved()
    with storage.transaction() as db:
        db.scalar(select(ProviderProfile)).enabled = False
    set_env(monkeypatch, API_KEY=KEY, MODEL="again")
    start()
    (profile,) = profiles()
    assert (profile.default_model, profile.enabled) == ("again", True)


def test_a_key_that_no_longer_decrypts_does_not_stop_the_service(start, monkeypatch):
    saved()
    with storage.transaction() as db:
        db.scalar(
            select(ProviderProfile)
        ).encrypted_secret = '{"nonce": "AAAA", "ciphertext": "AAAA"}'
    set_env(monkeypatch, API_KEY=KEY, MODEL="fresh")
    start()
    (profile,) = profiles()
    assert profile.default_model == "fresh"

"""我的對話的平台金鑰與系統帳號（spec §10 M3、M8）。

金鑰由部署環境變數帶入，啟動時替系統帳號建立／更新／停用一組連線設定；設定不合法就讓服務起不來。
"""

import socket

import pytest
from sqlalchemy import func, select

from app.classroom_app import create_app
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import AccountAISettings, ProviderProfile
from app.modules.app_shell import practice_startup
from app.modules.course_management import service as course_service
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from tests.course_management.conftest import PASSWORD

KEY = "sk-or-v1-platform-key-0001"
ENV = {
    "SOCRATES_PRACTICE_LLM_API_KEY": KEY,
    "SOCRATES_PRACTICE_LLM_MODEL": "openrouter/free",
}


def config(**env):
    return ai_service.platform_profile_config({**ENV, **env})


def prepare(cfg):
    with storage.transaction() as db:
        practice_startup.prepare_practice(db, cfg)


def owner_id():
    with storage.transaction() as db:
        return course_service.practice_owner(db).id


def chain():
    with storage.transaction() as db:
        bindings, _ = ai_service.resolve_owner_chain(db, owner_id(), "socratic_tutor")
        return bindings


# ---- 讀環境變數（不碰資料庫） ----


def test_no_key_means_no_platform_connection():
    assert ai_service.platform_profile_config({}) is None
    assert ai_service.platform_profile_config({"SOCRATES_PRACTICE_LLM_MODEL": "x"}) is None


def test_a_valid_openrouter_setting_is_read():
    cfg = config()
    assert (cfg.adapter, cfg.model, cfg.api_key, cfg.base_url) == (
        "openrouter",
        "openrouter/free",
        KEY,
        None,
    )


@pytest.mark.parametrize(
    "env",
    [
        {"SOCRATES_PRACTICE_LLM_ADAPTER": "openroutr"},  # unknown adapter
        {"SOCRATES_PRACTICE_LLM_MODEL": "  "},  # blank model
        {"SOCRATES_PRACTICE_LLM_API_KEY": "sk-'quoted'"},  # forbidden characters
        {"SOCRATES_PRACTICE_LLM_BASE_URL": "https://example.com/v1"},  # base URL on openrouter
        {"SOCRATES_PRACTICE_LLM_ADAPTER": "openai-compatible"},  # openai-compatible needs one
        {
            "SOCRATES_PRACTICE_LLM_ADAPTER": "openai-compatible",
            "SOCRATES_PRACTICE_LLM_BASE_URL": "http://example.com/v1",  # not https
        },
    ],
)
def test_a_broken_setting_is_rejected(env):
    with pytest.raises(ValueError):
        config(**env)


def test_openai_compatible_takes_a_checked_base_url(monkeypatch):
    # 不真的查 DNS：假裝解析到一個公開位址
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("93.184.216.34", 0))]
    )
    cfg = config(
        SOCRATES_PRACTICE_LLM_ADAPTER="openai-compatible",
        SOCRATES_PRACTICE_LLM_BASE_URL="https://llm.example.com/v1",
    )
    assert (cfg.adapter, cfg.base_url) == ("openai-compatible", "https://llm.example.com/v1")


def test_a_broken_setting_stops_the_service_from_starting(monkeypatch):
    monkeypatch.setenv("SOCRATES_PRACTICE_LLM_API_KEY", KEY)
    monkeypatch.setenv("SOCRATES_PRACTICE_LLM_ADAPTER", "openroutr")
    with pytest.raises(ValueError):
        create_app(background=False)


# ---- 啟動時寫進資料庫 ----


def test_the_system_account_is_created_once_and_cannot_log_in(client):
    prepare(None)
    prepare(None)
    with storage.transaction() as db:
        rows = db.scalars(select(Account).where(Account.username == "@practice-owner")).all()
        assert len(rows) == 1
        assert (rows[0].email, rows[0].password_hash, rows[0].account_role) == (
            None,
            None,
            "teacher",
        )
    r = client.post("/api/v2/auth/login", json={"login": "@practice-owner", "password": PASSWORD})
    assert r.status_code == 401
    body = {"username": "@practice-owner", "email": "p@example.org", "password": PASSWORD}
    assert client.post("/api/v2/auth/register", json=body).status_code == 422


def test_two_workers_racing_still_get_one_system_account(client, monkeypatch):
    prepare(None)
    real = course_service.practice_owner
    # 模擬另一個 worker 已經插入：第一次查詢看不到既有的列，插入撞唯一鍵後要重讀
    from app.modules.course_management import practice

    calls = {"n": 0}
    lookup = practice._find_owner

    def miss_once(db):
        calls["n"] += 1
        return None if calls["n"] == 1 else lookup(db)

    monkeypatch.setattr(practice, "_find_owner", miss_once)
    with storage.transaction() as db:
        assert real(db).username == "@practice-owner"
        assert db.scalar(select(func.count()).select_from(Account)) == 1


def test_a_key_gives_the_system_account_a_default_persistent_connection(client):
    prepare(config())
    (binding,) = chain()
    assert (binding["adapter"], binding["model"], binding["secret"]) == (
        "openrouter",
        "openrouter/free",
        KEY,
    )
    with storage.transaction() as db:
        profile = db.scalar(select(ProviderProfile))
        assert (profile.credential_mode, profile.enabled, profile.secret_last4) == (
            "PERSISTENT",
            True,
            KEY[-4:],
        )
        assert db.get(AccountAISettings, profile.owner_id).default_profile_id == profile.id


def test_a_new_key_or_model_updates_the_same_connection(client):
    prepare(config())
    prepare(
        config(SOCRATES_PRACTICE_LLM_API_KEY="sk-new-key-9999", SOCRATES_PRACTICE_LLM_MODEL="m2")
    )
    (binding,) = chain()
    assert (binding["secret"], binding["model"]) == ("sk-new-key-9999", "m2")
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(ProviderProfile)) == 1


def test_removing_the_key_disables_it_and_adding_it_back_enables_it(client):
    prepare(config())
    prepare(None)
    assert chain() == []
    prepare(config())
    assert len(chain()) == 1


def test_two_workers_racing_still_get_one_connection(client, monkeypatch):
    prepare(config())
    lookup = ai_service._find_platform_profile
    calls = {"n": 0}

    def miss_once(db, owner):
        calls["n"] += 1
        return None if calls["n"] == 1 else lookup(db, owner)

    monkeypatch.setattr(ai_service, "_find_platform_profile", miss_once)
    prepare(config())
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(ProviderProfile)) == 1
    assert len(chain()) == 1

import time

import pytest

from app.tutor.classroom_gateway import validate_base_url
from app.api.routes.provider_profiles import (
    AccountAISettings,
    ProviderProfile,
    SessionProviderSecret,
    _open,
    _profile_view,
    _seal,
    profile_secret,
    resolve_provider_chain,
)
from app.repositories.classroom_storage import (
    Account,
    LoginSession,
    Room,
    Script,
    configure,
    transaction,
)


@pytest.fixture(autouse=True)
def database(monkeypatch):
    monkeypatch.delenv("SOCRATES_PROVIDER_MASTER_KEY", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    configure("sqlite+pysqlite:///:memory:", create=True)


def seed():
    with transaction() as db:
        account = Account(
            id="00000000-0000-4000-8000-000000000097",
            username="owner",
            email="owner@example.test",
            password_hash="fixture",
            verified=True,
        )
        script = Script(
            id="10000000-0000-4000-8000-000000000097",
            owner_id=account.id,
            document={"title": "R97", "questions": []},
            revision=1,
        )
        room = Room(
            id="20000000-0000-4000-8000-000000000097",
            creator_id=account.id,
            script_id=script.id,
            code="R97TEST",
            state={
                "script": {"live_llm_call_budget": 30},
                "members": {},
            },
        )
        session = LoginSession(
            token_hash="s" * 64,
            account_id=account.id,
            csrf_token="csrf",
            expires_at=time.time() + 3600,
        )
        db.add_all([account, script, room, session])
    return account.id, room.id, session.token_hash


def test_encryption_round_trip_and_masked_view():
    encrypted, version = _seal(
        "sk-r97-example",
        profile_id="profile-1",
        owner_id="owner-1",
    )
    assert version == "derived-v1"
    assert "sk-r97-example" not in encrypted
    assert (
        _open(
            encrypted,
            profile_id="profile-1",
            owner_id="owner-1",
        )
        == "sk-r97-example"
    )
    profile = ProviderProfile(
        id="profile-1",
        owner_id="owner-1",
        name="OpenRouter",
        adapter="openrouter",
        default_model="openrouter/free",
        encrypted_secret=encrypted,
        secret_last4="mple",
    )
    projection = _profile_view(profile)
    assert "encrypted_secret" not in projection
    assert projection["secret_last4"] == "mple"


def test_session_secret_expires_with_login_session():
    owner_id, _, token_hash = seed()
    with transaction() as db:
        profile = ProviderProfile(
            id="30000000-0000-4000-8000-000000000097",
            owner_id=owner_id,
            name="Session",
            adapter="openai",
            default_model="gpt-test",
            credential_mode="SESSION",
        )
        db.add(profile)
        encrypted, version = _seal(
            "session-secret",
            profile_id=profile.id,
            owner_id=owner_id,
        )
        db.add(
            SessionProviderSecret(
                profile_id=profile.id,
                session_token_hash=token_hash,
                encrypted_secret=encrypted,
                secret_last4="cret",
                key_version=version,
                expires_at=time.time() + 60,
            )
        )
    with transaction() as db:
        profile = db.get(
            ProviderProfile,
            "30000000-0000-4000-8000-000000000097",
        )
        assert (
            profile_secret(
                db,
                profile,
                session_token_hash=token_hash,
            )
            == "session-secret"
        )


def test_classroom_owner_profile_and_model_precedence():
    owner_id, room_id, _ = seed()
    with transaction() as db:
        encrypted, version = _seal(
            "owner-key",
            profile_id="40000000-0000-4000-8000-000000000097",
            owner_id=owner_id,
        )
        profile = ProviderProfile(
            id="40000000-0000-4000-8000-000000000097",
            owner_id=owner_id,
            name="Owner",
            adapter="openrouter",
            default_model="profile-default",
            credential_mode="PERSISTENT",
            encrypted_secret=encrypted,
            secret_last4="-key",
            key_version=version,
        )
        settings = AccountAISettings(
            owner_id=owner_id,
            default_profile_id=profile.id,
            model_matrix={"socratic_tutor": "matrix-model"},
            budgets={
                "max_calls": 40,
                "max_tokens": 10000,
                "estimated_cost_ceiling": None,
            },
        )
        db.add_all([profile, settings])
    with transaction() as db:
        room = db.get(Room, room_id)
        bindings, routing = resolve_provider_chain(
            db,
            room,
            "focused_tutor",
            {"model": "individual-model"},
        )
        assert bindings[0]["owner_id"] == owner_id
        assert bindings[0]["model"] == "individual-model"
        assert bindings[0]["secret"] == "owner-key"
        assert routing["role"] == "socratic_tutor"


def test_stage_custom_endpoint_requires_public_https(monkeypatch):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", "stage")
    with pytest.raises(Exception):
        validate_base_url(
            "openai-compatible",
            "http://127.0.0.1:11434/v1",
        )


def test_local_allowlist_accepts_local_openai_compatible(monkeypatch):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", "local-dev")
    monkeypatch.setenv(
        "SOCRATES_PROVIDER_LOCAL_ALLOWLIST",
        "127.0.0.1,localhost",
    )
    assert (
        validate_base_url(
            "openai-compatible",
            "http://127.0.0.1:11434/v1",
        )
        == "http://127.0.0.1:11434/v1"
    )


def test_derived_key_roundtrip_without_master_key():
    from app.api.routes.provider_profiles import DERIVED_VERSION, _open, _seal

    payload, version = _seal("sk-test", profile_id="p1", owner_id="o1")
    assert version == DERIVED_VERSION
    assert _open(payload, profile_id="p1", owner_id="o1") == "sk-test"

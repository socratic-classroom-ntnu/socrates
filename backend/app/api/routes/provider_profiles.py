"""Account-owned provider profiles and Classroom-owner AI routing."""

from __future__ import annotations

import base64
from copy import deepcopy
import json
import os
import secrets
import time
from typing import Any, Literal
from uuid import uuid4

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import (
    Boolean,
    delete,
    Float,
    ForeignKey,
    JSON,
    String,
    Text,
    UniqueConstraint,
    select,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.orchestrator.classroom import DomainError
from app.repositories.classroom_storage import (
    Account,
    Base,
    LoginSession,
    Room,
    digest,
    transaction,
)

ADAPTERS = frozenset(
    {
        "openrouter",
        "openai",
        "anthropic",
        "gemini",
        "openai-compatible",
    }
)
ROLE_KEYS = (
    "socratic_tutor",
    "ai_student",
    "dynamic_question",
    "question_summary",
    "class_summary",
    "personal_summary",
    "other_suggestion",
    "ai_script_authoring",
)
JOB_ROLE = {
    "focused_tutor": "socratic_tutor",
    "llm_student_turn": "ai_student",
    "dynamic_question": "dynamic_question",
    "question_summary": "question_summary",
    "class_summary": "class_summary",
    "personal_summary": "personal_summary",
    "other_suggestion": "other_suggestion",
    "ai_script_authoring": "ai_script_authoring",
}
DEFAULT_BUDGET = {
    "max_calls": 240,
    "max_tokens": 1_000_000,
    "estimated_cost_ceiling": None,
    "fallback_policy": "owner-profile-then-deterministic",
}


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"
    __table_args__ = (UniqueConstraint("owner_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    adapter: Mapped[str] = mapped_column(String(32))
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(200), nullable=True)
    project: Mapped[str | None] = mapped_column(String(200), nullable=True)
    default_model: Mapped[str] = mapped_column(String(200))
    credential_mode: Mapped[str] = mapped_column(String(24), default="PERSISTENT")
    encrypted_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    secret_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    key_version: Mapped[str] = mapped_column(String(40), default="v1")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class SessionProviderSecret(Base):
    __tablename__ = "session_provider_secrets"

    profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), primary_key=True
    )
    session_token_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("login_sessions.token_hash"), primary_key=True
    )
    encrypted_secret: Mapped[str] = mapped_column(Text)
    secret_last4: Mapped[str] = mapped_column(String(4))
    key_version: Mapped[str] = mapped_column(String(40), default="v1")
    expires_at: Mapped[float] = mapped_column(Float, index=True)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class AccountAISettings(Base):
    __tablename__ = "account_ai_settings"

    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), primary_key=True)
    default_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), nullable=True
    )
    fallback_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), nullable=True
    )
    model_matrix: Mapped[dict] = mapped_column(JSON, default=dict)
    budgets: Mapped[dict] = mapped_column(JSON, default=lambda: deepcopy(DEFAULT_BUDGET))
    session_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revision: Mapped[int] = mapped_column(default=1)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class CreateProfile(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    adapter: str
    base_url: str | None = Field(default=None, max_length=500)
    organization: str | None = Field(default=None, max_length=200)
    project: str | None = Field(default=None, max_length=200)
    default_model: str = Field(min_length=1, max_length=200)
    credential_mode: Literal["PERSISTENT", "SESSION"] = "PERSISTENT"
    credential: str | None = Field(default=None, min_length=1, max_length=20000)

    @field_validator("adapter")
    @classmethod
    def valid_adapter(cls, value: str) -> str:
        value = value.strip().casefold()
        if value not in ADAPTERS:
            raise ValueError("PROVIDER_ADAPTER_REQUIRED")
        return value


class UpdateProfile(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    base_url: str | None = Field(default=None, max_length=500)
    organization: str | None = Field(default=None, max_length=200)
    project: str | None = Field(default=None, max_length=200)
    default_model: str | None = Field(default=None, min_length=1, max_length=200)
    enabled: bool | None = None


class CredentialUpdate(BaseModel):
    credential: str = Field(min_length=1, max_length=20000)
    credential_mode: Literal["PERSISTENT", "SESSION"]


class SettingsUpdate(BaseModel):
    default_profile_id: str | None = None
    fallback_profile_id: str | None = None
    model_matrix: dict[str, str] = Field(default_factory=dict)
    budgets: dict[str, Any] = Field(default_factory=dict)
    active_room_id: str | None = None


router = APIRouter()


DERIVED_VERSION = "derived-v1"


def _derived_key() -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    ikm = os.environ.get("DATABASE_URL", "").strip()
    if not ikm:
        raise DomainError("PROVIDER_KEY_SOURCE_REQUIRED", 503)
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"socrates",
        info=b"socrates/provider-profiles/v1",
    ).derive(ikm.encode())


def _legacy_key() -> bytes | None:
    raw = os.environ.get("SOCRATES_PROVIDER_MASTER_KEY", "").strip()
    if not raw:
        return None
    try:
        key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except ValueError:
        return None
    return key if len(key) == 32 else None


def _master_key(version: str | None = None) -> tuple[bytes, str]:
    if version in (None, DERIVED_VERSION):
        return _derived_key(), DERIVED_VERSION
    legacy = _legacy_key()
    if legacy is None:
        raise DomainError("PROVIDER_CREDENTIAL_REENTRY_REQUIRED", 409)
    assert version is not None
    return legacy, version


def _seal(secret: str, *, profile_id: str, owner_id: str) -> tuple[str, str]:
    key, version = _master_key()
    nonce = secrets.token_bytes(12)
    aad = f"socrates-provider:{profile_id}:{owner_id}:{version}".encode()
    ciphertext = AESGCM(key).encrypt(nonce, secret.encode(), aad)
    payload = {
        "version": version,
        "nonce": base64.urlsafe_b64encode(nonce).decode().rstrip("="),
        "ciphertext": base64.urlsafe_b64encode(ciphertext).decode().rstrip("="),
    }
    return json.dumps(payload, separators=(",", ":")), version


def _open(payload: str, *, profile_id: str, owner_id: str) -> str:
    data = json.loads(payload)
    version = str(data.get("version") or DERIVED_VERSION)
    key, _ = _master_key(version)
    nonce = base64.urlsafe_b64decode(str(data["nonce"]) + "=" * (-len(str(data["nonce"])) % 4))
    ciphertext = base64.urlsafe_b64decode(
        str(data["ciphertext"]) + "=" * (-len(str(data["ciphertext"])) % 4)
    )
    aad = f"socrates-provider:{profile_id}:{owner_id}:{version}".encode()
    try:
        clear = AESGCM(key).decrypt(nonce, ciphertext, aad)
    except Exception as exc:
        raise DomainError("PROVIDER_CREDENTIAL_DECRYPTION", 503) from exc
    return clear.decode()


def _account(db, request: Request, mutation=False):
    from app.api.routes.classroom import account

    return account(db, request, mutation)


def _owned_profile(db, owner_id: str, profile_id: str, lock=False) -> ProviderProfile:
    query = select(ProviderProfile).where(
        ProviderProfile.id == profile_id,
        ProviderProfile.owner_id == owner_id,
    )
    if lock:
        query = query.with_for_update()
    row = db.scalar(query)
    if row is None:
        raise DomainError("PROVIDER_PROFILE_OWNER_REQUIRED", 404)
    return row


def _session_hash(request: Request) -> str:
    from app.services import classroom_auth as auth

    token = request.cookies.get(auth.COOKIE)
    if not token:
        raise DomainError("LOGIN_REQUIRED", 401)
    return digest(token)


def _profile_view(row: ProviderProfile, *, has_session_secret=False) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "adapter": row.adapter,
        "base_url": row.base_url,
        "organization": row.organization,
        "project": row.project,
        "default_model": row.default_model,
        "credential_mode": row.credential_mode,
        "has_credential": bool(row.encrypted_secret) or has_session_secret,
        "secret_last4": row.secret_last4,
        "enabled": row.enabled,
        "metadata": row.metadata_json,
        "updated_at": row.updated_at,
    }


def _validate_matrix(matrix: dict[str, str]) -> dict[str, str]:
    result = {}
    for key, model in matrix.items():
        if key not in ROLE_KEYS:
            raise DomainError("AI_ROLE_REQUIRED", 422)
        value = str(model).strip()
        if not value or len(value) > 200:
            raise DomainError("AI_MODEL_ID_REQUIRED", 422)
        result[key] = value
    return result


def _validate_budget(value: dict[str, Any]) -> dict:
    result: dict[str, Any] = deepcopy(DEFAULT_BUDGET)
    result.update(value or {})
    result["max_calls"] = int(result["max_calls"])
    result["max_tokens"] = int(result["max_tokens"])
    if result["max_calls"] < 0 or result["max_tokens"] < 0:
        raise DomainError("AI_BUDGET_REQUIRED", 422)
    ceiling = result.get("estimated_cost_ceiling")
    result["estimated_cost_ceiling"] = None if ceiling is None or ceiling == "" else float(ceiling)
    result["fallback_policy"] = "owner-profile-then-deterministic"
    return result


def _settings_view(row: AccountAISettings | None) -> dict:
    return {
        "default_profile_id": row.default_profile_id if row else None,
        "fallback_profile_id": row.fallback_profile_id if row else None,
        "model_matrix": deepcopy(row.model_matrix) if row else {},
        "budgets": deepcopy(row.budgets) if row else deepcopy(DEFAULT_BUDGET),
        "revision": row.revision if row else 0,
    }


def _ensure_owner_profiles(db, owner_id: str, profile_ids: list[str | None]) -> None:
    for profile_id in profile_ids:
        if profile_id:
            _owned_profile(db, owner_id, profile_id)


def _store_credential(
    db,
    profile: ProviderProfile,
    session: LoginSession,
    credential: str,
    mode: str,
) -> None:
    encrypted, version = _seal(credential, profile_id=profile.id, owner_id=profile.owner_id)
    profile.credential_mode = mode
    profile.secret_last4 = credential[-4:]
    profile.key_version = version
    profile.updated_at = time.time()
    if mode == "PERSISTENT":
        profile.encrypted_secret = encrypted
        old = db.get(SessionProviderSecret, (profile.id, session.token_hash))
        if old:
            db.delete(old)
    else:
        profile.encrypted_secret = None
        row = db.get(SessionProviderSecret, (profile.id, session.token_hash))
        if row is None:
            row = SessionProviderSecret(
                profile_id=profile.id,
                session_token_hash=session.token_hash,
                encrypted_secret=encrypted,
                secret_last4=credential[-4:],
                key_version=version,
                expires_at=session.expires_at,
            )
            db.add(row)
        else:
            row.encrypted_secret = encrypted
            row.secret_last4 = credential[-4:]
            row.key_version = version
            row.expires_at = session.expires_at
            row.updated_at = time.time()


def profile_secret(
    db,
    profile: ProviderProfile,
    *,
    session_token_hash: str | None,
) -> str | None:
    if profile.credential_mode == "PERSISTENT" and profile.encrypted_secret:
        return _open(
            profile.encrypted_secret,
            profile_id=profile.id,
            owner_id=profile.owner_id,
        )
    if profile.credential_mode == "SESSION" and session_token_hash:
        row = db.get(SessionProviderSecret, (profile.id, session_token_hash))
        if row and row.expires_at > time.time():
            return _open(
                row.encrypted_secret,
                profile_id=profile.id,
                owner_id=profile.owner_id,
            )
    return None


@router.get("/meta/revision")
def revision_metadata():
    return {
        "schema": "socrates/revision/v1",
        "source_sha": os.environ.get("SOCRATES_SOURCE_SHA", "local-worktree"),
        "worktree_sha256": os.environ.get("SOCRATES_WORKTREE_SHA256", "live-worktree"),
        "environment": os.environ.get("SOCRATES_ENVIRONMENT", "local-dev"),
        "feature_revision": 97,
        "provider_profiles": True,
        "classroom_owner_routing": True,
        "observed_at": time.time(),
    }


@router.get("/provider-profiles")
def list_profiles(request: Request):
    with transaction() as db:
        account, session = _account(db, request)
        rows = db.scalars(
            select(ProviderProfile)
            .where(ProviderProfile.owner_id == account.id)
            .order_by(ProviderProfile.created_at)
        ).all()
        session_ids = {
            row.profile_id
            for row in db.scalars(
                select(SessionProviderSecret).where(
                    SessionProviderSecret.session_token_hash == session.token_hash,
                    SessionProviderSecret.expires_at > time.time(),
                )
            )
        }
        return [_profile_view(row, has_session_secret=row.id in session_ids) for row in rows]


@router.post("/provider-profiles")
def create_profile(body: CreateProfile, request: Request):
    with transaction() as db:
        account, session = _account(db, request, True)
        from app.tutor.classroom_gateway import validate_base_url

        validated_base = (
            validate_base_url(body.adapter, body.base_url)
            if body.adapter == "openai-compatible"
            else body.base_url
        )
        row = ProviderProfile(
            owner_id=account.id,
            name=body.name.strip(),
            adapter=body.adapter,
            base_url=validated_base.strip() if validated_base else None,
            organization=body.organization,
            project=body.project,
            default_model=body.default_model.strip(),
            credential_mode=body.credential_mode,
        )
        db.add(row)
        db.flush()
        if body.credential:
            _store_credential(
                db,
                row,
                session,
                body.credential,
                body.credential_mode,
            )
        return _profile_view(row, has_session_secret=bool(body.credential))


@router.patch("/provider-profiles/{profile_id}")
def update_profile(profile_id: str, body: UpdateProfile, request: Request):
    with transaction() as db:
        account, _ = _account(db, request, True)
        row = _owned_profile(db, account.id, profile_id, True)
        values = body.model_dump(exclude_unset=True)
        if "base_url" in values and row.adapter == "openai-compatible":
            from app.tutor.classroom_gateway import validate_base_url

            values["base_url"] = validate_base_url(row.adapter, values["base_url"])
        for key, value in values.items():
            if key == "name" and value is not None:
                value = value.strip()
            if key == "default_model" and value is not None:
                value = value.strip()
            if key == "base_url" and value is not None:
                value = value.strip()
            setattr(row, key, value)
        row.updated_at = time.time()
        return _profile_view(row)


@router.post("/provider-profiles/{profile_id}/credential")
def update_credential(profile_id: str, body: CredentialUpdate, request: Request):
    with transaction() as db:
        account, session = _account(db, request, True)
        row = _owned_profile(db, account.id, profile_id, True)
        _store_credential(
            db,
            row,
            session,
            body.credential,
            body.credential_mode,
        )
        return _profile_view(row, has_session_secret=True)


@router.delete("/provider-profiles/{profile_id}")
def delete_profile(profile_id: str, request: Request):
    from app.api.routes.classroom_library import ClassroomAssets

    with transaction() as db:
        account, _ = _account(db, request, True)
        row = _owned_profile(db, account.id, profile_id, True)
        settings = db.get(AccountAISettings, account.id)
        if settings and profile_id in {
            settings.default_profile_id,
            settings.fallback_profile_id,
        }:
            raise DomainError("PROVIDER_PROFILE_IN_ACCOUNT_SETTINGS", 409)
        classrooms = db.scalars(
            select(ClassroomAssets).where(ClassroomAssets.owner_id == account.id)
        ).all()
        for classroom in classrooms:
            ai = classroom.assets.get("ai_settings", {})
            if profile_id in {
                ai.get("default_profile_id"),
                ai.get("fallback_profile_id"),
            }:
                raise DomainError("PROVIDER_PROFILE_IN_CLASSROOM_SETTINGS", 409)
        from app.services.ai_students import AIStudentProfile

        if (
            db.scalar(
                select(AIStudentProfile.account_id)
                .where(AIStudentProfile.provider_profile_id == profile_id)
                .limit(1)
            )
            is not None
        ):
            raise DomainError("PROVIDER_PROFILE_IN_AI_STUDENT", 409)
        db.execute(
            delete(SessionProviderSecret).where(SessionProviderSecret.profile_id == profile_id)
        )
        db.delete(row)
        return {"status": "DELETED", "profile_id": profile_id}


@router.post("/provider-profiles/{profile_id}/test")
async def test_profile(profile_id: str, request: Request):
    from app.tutor.classroom_gateway import test_connection

    with transaction() as db:
        account, session = _account(db, request, True)
        row = _owned_profile(db, account.id, profile_id)
        secret = profile_secret(db, row, session_token_hash=session.token_hash)
        if not secret:
            raise DomainError("PROVIDER_CREDENTIAL_REQUIRED", 409)
        binding = binding_from_profile(
            row,
            secret=secret,
            model=row.default_model,
            role="connection_test",
            owner_id=account.id,
        )
    return await test_connection(binding)


@router.get("/provider-profiles/{profile_id}/models")
async def provider_models(profile_id: str, request: Request):
    from app.tutor.classroom_gateway import discover_models

    with transaction() as db:
        account, session = _account(db, request)
        row = _owned_profile(db, account.id, profile_id)
        secret = profile_secret(db, row, session_token_hash=session.token_hash)
        if not secret:
            raise DomainError("PROVIDER_CREDENTIAL_REQUIRED", 409)
        binding = binding_from_profile(
            row,
            secret=secret,
            model=row.default_model,
            role="model_discovery",
            owner_id=account.id,
        )
    result = await discover_models(binding)
    with transaction() as db:
        current = _owned_profile(db, account.id, profile_id, True)
        current.metadata_json = {
            **current.metadata_json,
            "model_cache": result,
            "model_cache_at": time.time(),
        }
        current.updated_at = time.time()
    return result


@router.get("/ai-settings/account")
def account_settings(request: Request):
    with transaction() as db:
        account, _ = _account(db, request)
        return _settings_view(db.get(AccountAISettings, account.id))


@router.put("/ai-settings/account")
def update_account_settings(body: SettingsUpdate, request: Request):
    with transaction() as db:
        account, session = _account(db, request, True)
        _ensure_owner_profiles(
            db,
            account.id,
            [body.default_profile_id, body.fallback_profile_id],
        )
        row = db.get(AccountAISettings, account.id)
        if row is None:
            row = AccountAISettings(owner_id=account.id)
            db.add(row)
        row.default_profile_id = body.default_profile_id
        row.fallback_profile_id = body.fallback_profile_id
        row.model_matrix = _validate_matrix(body.model_matrix)
        row.budgets = _validate_budget(body.budgets)
        row.session_token_hash = session.token_hash
        row.revision = int(row.revision or 0) + 1
        row.updated_at = time.time()
        return _settings_view(row)


def _classroom_settings_view(ai: dict | None) -> dict:
    value = deepcopy(ai or {})
    value.pop("session_token_hash", None)
    value.setdefault("default_profile_id", None)
    value.setdefault("fallback_profile_id", None)
    value.setdefault("model_matrix", {})
    value.setdefault("scenario_overrides", {})
    value.setdefault("budgets", deepcopy(DEFAULT_BUDGET))
    value.setdefault("revision", 0)
    return value


@router.get("/library/classrooms/{cid}/ai-settings")
def classroom_settings(cid: str, request: Request):
    from app.api.routes.classroom_library import owned

    with transaction() as db:
        account, _ = _account(db, request)
        classroom = owned(db, cid, account)
        return _classroom_settings_view(classroom.assets.get("ai_settings"))


@router.put("/library/classrooms/{cid}/ai-settings")
def update_classroom_settings(cid: str, body: SettingsUpdate, request: Request):
    from app.api.routes.classroom_library import owned

    with transaction() as db:
        account, session = _account(db, request, True)
        classroom = owned(db, cid, account, True)
        _ensure_owner_profiles(
            db,
            account.id,
            [body.default_profile_id, body.fallback_profile_id],
        )
        assets = deepcopy(classroom.assets)
        prior = assets.get("ai_settings", {})
        assets["ai_settings"] = {
            "default_profile_id": body.default_profile_id,
            "fallback_profile_id": body.fallback_profile_id,
            "model_matrix": _validate_matrix(body.model_matrix),
            "scenario_overrides": deepcopy(prior.get("scenario_overrides", {})),
            "budgets": _validate_budget(body.budgets),
            "revision": int(prior.get("revision", 0)) + 1,
        }
        classroom.assets = assets
        classroom.revision += 1
        account_settings = db.get(AccountAISettings, account.id)
        if account_settings is None:
            account_settings = AccountAISettings(owner_id=account.id)
            db.add(account_settings)
        account_settings.session_token_hash = session.token_hash
        account_settings.updated_at = time.time()

        if body.active_room_id:
            room = db.get(Room, body.active_room_id)
            if room is None or room.creator_id != account.id:
                raise DomainError("CLASSROOM_OWNER_REQUIRED", 403)
            if room.state.get("phase") != "lobby":
                raise DomainError("LOBBY_REQUIRED", 409)
            state = deepcopy(room.state)
            state["asset_snapshot"] = {
                **deepcopy(state.get("asset_snapshot", {})),
                "assets": deepcopy(assets),
                "classroom_id": cid,
                "classroom_revision": classroom.revision,
            }
            ai_model = assets["ai_settings"]["model_matrix"].get("ai_student")
            for member in state.get("members", {}).values():
                if member.get("actor_type") == "llm_student":
                    if ai_model:
                        member["model"] = ai_model
                    member["provider_profile_id"] = body.default_profile_id
            room.state = state

            from app.services.ai_students import AIStudentProfile

            for profile in db.scalars(
                select(AIStudentProfile).where(
                    AIStudentProfile.parent_room_id == body.active_room_id
                )
            ):
                if ai_model:
                    profile.model = ai_model
                profile.provider_profile_id = body.default_profile_id

        return _classroom_settings_view(assets["ai_settings"])


def binding_from_profile(
    profile: ProviderProfile,
    *,
    secret: str,
    model: str,
    role: str,
    owner_id: str,
) -> dict:
    return {
        "profile_id": profile.id,
        "owner_id": owner_id,
        "adapter": profile.adapter,
        "base_url": profile.base_url,
        "organization": profile.organization,
        "project": profile.project,
        "model": model or profile.default_model,
        "secret": secret,
        "role": role,
        "metadata": deepcopy(profile.metadata_json),
    }


def public_binding(binding: dict) -> dict:
    return {key: value for key, value in binding.items() if key not in {"secret"}}


def _room_ai_settings(db, room: Room) -> tuple[str, dict, str | None]:
    owner_id = room.creator_id
    state = room.state
    snapshot = state.get("asset_snapshot")
    if state.get("portal_group"):
        snapshot = state["portal_group"].get("asset_snapshot") or snapshot
    ai = {}
    if snapshot:
        ai = deepcopy(snapshot.get("assets", {}).get("ai_settings", {}))
    if not ai and state.get("asset_classroom_id"):
        from app.api.routes.classroom_library import ClassroomAssets

        classroom = db.get(ClassroomAssets, state["asset_classroom_id"])
        if classroom and classroom.owner_id == owner_id:
            ai = deepcopy(classroom.assets.get("ai_settings", {}))
    account_settings = db.get(AccountAISettings, owner_id)
    if account_settings:
        fallback = _settings_view(account_settings)
        merged = deepcopy(fallback)
        merged.update({key: value for key, value in ai.items() if value is not None})
        merged["model_matrix"] = {
            **fallback.get("model_matrix", {}),
            **ai.get("model_matrix", {}),
        }
        merged["budgets"] = {
            **fallback.get("budgets", {}),
            **ai.get("budgets", {}),
        }
        ai = merged
        session_hash = account_settings.session_token_hash
    else:
        session_hash = None
    return owner_id, ai, session_hash


def resolve_provider_chain(
    db,
    room: Room,
    job_kind: str,
    context: dict,
) -> tuple[list[dict], dict]:
    owner_id, settings, session_hash = _room_ai_settings(db, room)
    role = JOB_ROLE.get(job_kind, job_kind)
    model_matrix = settings.get("model_matrix", {})
    scenario = context.get("scenario_ai", {})
    profile_id = (
        context.get("provider_profile_id")
        or scenario.get("provider_profile_id")
        or settings.get("default_profile_id")
    )
    model = context.get("model") or scenario.get("model") or model_matrix.get(role)
    fallback_id = settings.get("fallback_profile_id")
    profile_ids = []
    for candidate in [profile_id, fallback_id]:
        if candidate and candidate not in profile_ids:
            profile_ids.append(candidate)

    bindings = []
    for candidate in profile_ids:
        profile = db.scalar(
            select(ProviderProfile).where(
                ProviderProfile.id == candidate,
                ProviderProfile.owner_id == owner_id,
                ProviderProfile.enabled.is_(True),
            )
        )
        if profile is None:
            continue
        secret = profile_secret(db, profile, session_token_hash=session_hash)
        if not secret:
            continue
        bindings.append(
            binding_from_profile(
                profile,
                secret=secret,
                model=model or profile.default_model,
                role=role,
                owner_id=owner_id,
            )
        )
    budgets = _validate_budget(settings.get("budgets", {}))
    return bindings, {
        "owner_id": owner_id,
        "role": role,
        "budgets": budgets,
        "selected_profile_id": profile_id,
        "fallback_profile_id": fallback_id,
        "requested_model": model,
    }


def resolve_request_chain(
    db,
    *,
    account: Account,
    session: LoginSession,
    role: str,
    room: Room | None = None,
    model: str | None = None,
) -> tuple[list[dict], dict]:
    if room:
        return resolve_provider_chain(db, room, role, {"model": model})
    settings = db.get(AccountAISettings, account.id)
    view = _settings_view(settings)
    profile_ids = []
    for profile_id in [
        view.get("default_profile_id"),
        view.get("fallback_profile_id"),
    ]:
        if profile_id and profile_id not in profile_ids:
            profile_ids.append(profile_id)
    bindings = []
    for profile_id in profile_ids:
        profile = _owned_profile(db, account.id, profile_id)
        if not profile.enabled:
            continue
        secret = profile_secret(db, profile, session_token_hash=session.token_hash)
        if secret:
            bindings.append(
                binding_from_profile(
                    profile,
                    secret=secret,
                    model=model or view.get("model_matrix", {}).get(role) or profile.default_model,
                    role=role,
                    owner_id=account.id,
                )
            )
    return bindings, {
        "owner_id": account.id,
        "role": role,
        "budgets": _validate_budget(view.get("budgets", {})),
        "selected_profile_id": view.get("default_profile_id"),
        "fallback_profile_id": view.get("fallback_profile_id"),
        "requested_model": model or view.get("model_matrix", {}).get(role),
    }

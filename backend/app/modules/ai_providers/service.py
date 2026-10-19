from __future__ import annotations
import base64
from copy import deepcopy
import json
import os
import secrets
import time
from typing import Any, Callable
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Request
from sqlalchemy import (
    select,
)
from app.modules.platform.errors import DomainError
from app.modules.ai_providers.repositories import (
    AccountAISettings,
    DEFAULT_BUDGET,
    ProviderProfile,
    SessionProviderSecret,
)
from app.modules.identity_access.repositories import Account, LoginSession
from app.modules.ai_providers.repositories import CallAudit
from app.modules.platform.storage import digest, transaction
from app.modules.ai_providers.contracts import (
    CreateProfile,
    SettingsUpdate,
    UpdateProfile,
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
    "personal_tutor": "socratic_tutor",
    "llm_student_turn": "ai_student",
    "dynamic_question": "dynamic_question",
    "question_summary": "question_summary",
    "class_summary": "class_summary",
    "personal_summary": "personal_summary",
    "other_suggestion": "other_suggestion",
    "ai_script_authoring": "ai_script_authoring",
}


PROVIDER_OUTPUT_REASONS = frozenset(
    {
        "PROVIDER_EMPTY_CONTENT",
        "PROVIDER_SCHEMA_MISMATCH",
        "SCRIPT_ASSIST_INVALID_OUTPUT",
    }
)


def provider_error_status(reason: str) -> int:
    """Keep typed provider errors in the application response body through the proxy."""
    if reason in PROVIDER_OUTPUT_REASONS:
        return 422
    if reason.startswith("PROVIDER_HTTP_"):
        return 424
    return 503


def record_direct_call_audit(
    *,
    actor_id: str,
    endpoint: str,
    role: str,
    binding: dict | None,
    state: str,
    audit: dict | None = None,
    reason_code: str | None = None,
    latency_ms: int | None = None,
) -> dict:
    """Persist one interactive LLM attempt without requiring a classroom Job row."""
    audit = deepcopy(audit or {})
    metadata = {
        "state": state,
        "endpoint": endpoint,
        "account_id": actor_id,
        "role": role,
        "provider": audit.get("provider") or (binding or {}).get("adapter"),
        "provider_profile_id": audit.get("provider_profile_id")
        or (binding or {}).get("profile_id"),
        "requested_model": audit.get("requested_model") or (binding or {}).get("model"),
        "actual_model": audit.get("actual_model"),
        "latency_ms": audit.get("latency_ms", latency_ms),
        "token_usage": deepcopy(audit.get("token_usage", {})),
        "reasoning_tokens": audit.get("reasoning_tokens"),
        "visible_output_tokens": audit.get("visible_output_tokens"),
        "output_budget_tokens": audit.get("output_budget_tokens"),
        "reasoning_budget_tokens": audit.get("reasoning_budget_tokens"),
        "estimated_cost": audit.get("estimated_cost"),
        "reason_code": reason_code,
        "recorded_at": time.time(),
    }
    with transaction() as db:
        row = CallAudit(job_id=None, metadata_json=metadata)
        db.add(row)
        db.flush()
        audit_id = row.id
    return {"audit_id": audit_id, **metadata}


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


def account_from_request(db, request: Request, mutation=False):
    from app.modules.identity_access.service import account

    return account(db, request, mutation)


def ensure_profile_name_free(db, owner_id: str, name: str, keep_id: str | None = None) -> None:
    """同一個帳號的連線名稱不可重複（資料庫有 unique(owner_id, name)），先擋下來回 409。"""
    query = select(ProviderProfile.id).where(
        ProviderProfile.owner_id == owner_id, ProviderProfile.name == name
    )
    if keep_id is not None:
        query = query.where(ProviderProfile.id != keep_id)
    if db.scalar(query) is not None:
        raise DomainError("PROVIDER_PROFILE_NAME_TAKEN", 409)


def owned_profile(db, owner_id: str, profile_id: str, lock=False) -> ProviderProfile:
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


def request_session_hash(request: Request) -> str:
    from app.modules.identity_access import service as auth

    token = request.cookies.get(auth.COOKIE)
    if not token:
        raise DomainError("LOGIN_REQUIRED", 401)
    return digest(token)


def profile_view(row: ProviderProfile, *, has_session_secret=False) -> dict:
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


def validate_matrix(matrix: dict[str, str]) -> dict[str, str]:
    result = {}
    for key, model in matrix.items():
        if key not in ROLE_KEYS:
            raise DomainError("AI_ROLE_REQUIRED", 422)
        value = str(model).strip()
        if not value or len(value) > 200:
            raise DomainError("AI_MODEL_ID_REQUIRED", 422)
        result[key] = value
    return result


def validate_budget(value: dict[str, Any]) -> dict:
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


def settings_view(row: AccountAISettings | None) -> dict:
    return {
        "default_profile_id": row.default_profile_id if row else None,
        "fallback_profile_id": row.fallback_profile_id if row else None,
        "model_matrix": deepcopy(row.model_matrix) if row else {},
        "budgets": deepcopy(row.budgets) if row else deepcopy(DEFAULT_BUDGET),
        "revision": row.revision if row else 0,
    }


def ensure_owner_profiles(db, owner_id: str, profile_ids: list[str | None]) -> None:
    for profile_id in profile_ids:
        if profile_id:
            owned_profile(db, owner_id, profile_id)


def store_credential(
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


def classroom_settings_view(ai: dict | None) -> dict:
    value = deepcopy(ai or {})
    value.pop("session_token_hash", None)
    value.setdefault("default_profile_id", None)
    value.setdefault("fallback_profile_id", None)
    value.setdefault("model_matrix", {})
    value.setdefault("scenario_overrides", {})
    value.setdefault("budgets", deepcopy(DEFAULT_BUDGET))
    value.setdefault("revision", 0)
    return value


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


def merged_ai_settings(db, owner_id: str, classroom_ai: dict) -> tuple[dict, str | None]:
    """Classroom-level AI settings layered over the owner's account settings."""
    ai = deepcopy(classroom_ai)
    account_settings = db.get(AccountAISettings, owner_id)
    if account_settings is None:
        return ai, None
    fallback = settings_view(account_settings)
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
    return merged, account_settings.session_token_hash


def resolve_provider_chain(
    db,
    owner_id: str,
    classroom_ai: dict,
    job_kind: str,
    context: dict,
) -> tuple[list[dict], dict]:
    """Provider bindings for one job; the caller supplies the classroom's AI settings."""
    settings, session_hash = merged_ai_settings(db, owner_id, classroom_ai)
    role = JOB_ROLE.get(job_kind, job_kind)
    model_matrix = settings.get("model_matrix", {})
    # A question's scenario_ai (lifted into the job context by the orchestrator) names one
    # profile+model pair; the fallback profile keeps the classroom/role model.
    scenario = context.get("scenario_ai") or {}
    profile_id = (
        context.get("provider_profile_id")
        or scenario.get("provider_profile_id")
        or settings.get("default_profile_id")
    )
    model = context.get("model") or scenario.get("model") or model_matrix.get(role)
    fallback_model = context.get("model") or model_matrix.get(role)
    fallback_id = settings.get("fallback_profile_id")
    profile_ids = []
    # When a question routes to its own profile, the classroom default still backs it up
    # (with the role model) before the fallback profile, so a removed or disabled override
    # profile degrades to 沿用課堂設定 instead of leaving the question without a tutor.
    backups = [settings.get("default_profile_id")] if scenario else []
    for candidate in [profile_id, *backups, fallback_id]:
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
                model=(model if candidate == profile_id else fallback_model)
                or profile.default_model,
                role=role,
                owner_id=owner_id,
            )
        )
    budgets = validate_budget(settings.get("budgets", {}))
    return bindings, {
        "owner_id": owner_id,
        "role": role,
        "budgets": budgets,
        "selected_profile_id": profile_id,
        "fallback_profile_id": fallback_id,
        "requested_model": model,
        "scenario_ai": bool(scenario),
    }


def resolve_request_chain(
    db,
    *,
    account: Account,
    session: LoginSession,
    role: str,
    classroom: tuple[str, dict] | None = None,
    model: str | None = None,
) -> tuple[list[dict], dict]:
    if classroom:
        owner_id, classroom_ai = classroom
        return resolve_provider_chain(db, owner_id, classroom_ai, role, {"model": model})
    settings = db.get(AccountAISettings, account.id)
    view = settings_view(settings)
    profile_ids = []
    for profile_id in [
        view.get("default_profile_id"),
        view.get("fallback_profile_id"),
    ]:
        if profile_id and profile_id not in profile_ids:
            profile_ids.append(profile_id)
    bindings = []
    for profile_id in profile_ids:
        profile = owned_profile(db, account.id, profile_id)
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
        "budgets": validate_budget(view.get("budgets", {})),
        "selected_profile_id": view.get("default_profile_id"),
        "fallback_profile_id": view.get("fallback_profile_id"),
        "requested_model": model or view.get("model_matrix", {}).get(role),
    }


# Other modules that store a provider profile id register a check here (wired by the app shell);
# a check returns the reason code that blocks deleting the profile, or None.
ProfileUsageCheck = Callable[[Any, str, str], "str | None"]
PROFILE_USAGE_CHECKS: list[ProfileUsageCheck] = []


def register_profile_usage_check(check: ProfileUsageCheck) -> None:
    if check not in PROFILE_USAGE_CHECKS:
        PROFILE_USAGE_CHECKS.append(check)


def profile_in_use(db, owner_id: str, profile_id: str) -> str | None:
    settings = db.get(AccountAISettings, owner_id)
    if settings and profile_id in {settings.default_profile_id, settings.fallback_profile_id}:
        return "PROVIDER_PROFILE_IN_ACCOUNT_SETTINGS"
    for check in PROFILE_USAGE_CHECKS:
        reason = check(db, owner_id, profile_id)
        if reason:
            return reason
    return None


# Public surface for other modules (they import from service, not from these files).
from app.modules.ai_providers.classroom_provider import (  # noqa: E402
    ProviderWait as ProviderWait,
)


def provider_generate(*args: Any, **kwargs: Any) -> Any:
    """The provider call other modules may use; only llm_runtime.iron_rules calls it (test_iron_rules)."""
    from app.modules.ai_providers import classroom_gateway

    return classroom_gateway.generate(*args, **kwargs)


def list_provider_profiles(db, account, session):
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
    return [profile_view(row, has_session_secret=row.id in session_ids) for row in rows]


def create_provider_profile(db, account, session, body: CreateProfile):
    from app.modules.ai_providers.classroom_gateway import validate_base_url

    validated_base = (
        validate_base_url(body.adapter, body.base_url)
        if body.adapter == "openai-compatible"
        else body.base_url
    )
    ensure_profile_name_free(db, account.id, body.name.strip())
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
        store_credential(
            db,
            row,
            session,
            body.credential,
            body.credential_mode,
        )
    return profile_view(row, has_session_secret=bool(body.credential))


def update_provider_profile(db, account, _, profile_id: str, body: UpdateProfile):
    row = owned_profile(db, account.id, profile_id, True)
    values = body.model_dump(exclude_unset=True)
    if "base_url" in values and row.adapter == "openai-compatible":
        from app.modules.ai_providers.classroom_gateway import validate_base_url

        values["base_url"] = validate_base_url(row.adapter, values["base_url"])
    for key, value in values.items():
        if key == "name" and value is not None:
            value = value.strip()
            ensure_profile_name_free(db, row.owner_id, value, keep_id=row.id)
        if key == "default_model" and value is not None:
            value = value.strip()
        if key == "base_url" and value is not None:
            value = value.strip()
        setattr(row, key, value)
    row.updated_at = time.time()
    return profile_view(row)


def update_account_ai_settings(db, account, session, body: SettingsUpdate):
    ensure_owner_profiles(
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
    row.model_matrix = validate_matrix(body.model_matrix)
    row.budgets = validate_budget(body.budgets)
    row.session_token_hash = session.token_hash
    row.revision = int(row.revision or 0) + 1
    row.updated_at = time.time()
    return settings_view(row)

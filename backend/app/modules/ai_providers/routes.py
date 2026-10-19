"""Account-owned provider profiles and Classroom-owner AI routing."""

from __future__ import annotations

import os
import time

from fastapi import APIRouter, Request
from sqlalchemy import (
    delete,
)

from app.modules.platform.errors import DomainError
from app.modules.ai_providers.repositories import (
    AccountAISettings,
    SessionProviderSecret,
)
from app.modules.ai_providers.classroom_provider import ProviderWait
from app.modules.platform.storage import transaction
from app.modules.ai_providers.contracts import (
    CreateProfile,
    CredentialUpdate,
    SettingsUpdate,
    UpdateProfile,
)
from app.modules.ai_providers.service import (
    profile_in_use,
    account_from_request,
    owned_profile,
    profile_view,
    settings_view,
    store_credential,
    binding_from_profile,
    profile_secret,
    provider_error_status,
)
from app.modules.ai_providers.service import (
    list_provider_profiles,
    create_provider_profile,
    update_provider_profile,
    update_account_ai_settings,
)


router = APIRouter()


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
        account, session = account_from_request(db, request)
        return list_provider_profiles(db, account, session)


@router.post("/provider-profiles")
def create_profile(body: CreateProfile, request: Request):
    with transaction() as db:
        account, session = account_from_request(db, request, True)
        return create_provider_profile(db, account, session, body)


@router.patch("/provider-profiles/{profile_id}")
def update_profile(profile_id: str, body: UpdateProfile, request: Request):
    with transaction() as db:
        account, _ = account_from_request(db, request, True)
        return update_provider_profile(db, account, _, profile_id, body)


@router.post("/provider-profiles/{profile_id}/credential")
def update_credential(profile_id: str, body: CredentialUpdate, request: Request):
    with transaction() as db:
        account, session = account_from_request(db, request, True)
        row = owned_profile(db, account.id, profile_id, True)
        store_credential(
            db,
            row,
            session,
            body.credential,
            body.credential_mode,
        )
        return profile_view(row, has_session_secret=True)


@router.delete("/provider-profiles/{profile_id}")
def delete_profile(profile_id: str, request: Request):
    with transaction() as db:
        account, _ = account_from_request(db, request, True)
        row = owned_profile(db, account.id, profile_id, True)
        reason = profile_in_use(db, account.id, profile_id)
        if reason:
            raise DomainError(reason, 409)
        db.execute(
            delete(SessionProviderSecret).where(SessionProviderSecret.profile_id == profile_id)
        )
        db.delete(row)
        return {"status": "DELETED", "profile_id": profile_id}


@router.post("/provider-profiles/{profile_id}/test")
async def test_profile(profile_id: str, request: Request):
    from app.modules.ai_providers.classroom_gateway import test_connection

    with transaction() as db:
        account, session = account_from_request(db, request, True)
        row = owned_profile(db, account.id, profile_id)
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
    try:
        return await test_connection(binding)
    except ProviderWait as exc:
        raise DomainError(exc.reason, provider_error_status(exc.reason)) from exc


@router.get("/provider-profiles/{profile_id}/models")
async def provider_models(profile_id: str, request: Request):
    from app.modules.ai_providers.classroom_gateway import discover_models

    with transaction() as db:
        account, session = account_from_request(db, request)
        row = owned_profile(db, account.id, profile_id)
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
    try:
        result = await discover_models(binding)
    except ProviderWait as exc:
        raise DomainError(exc.reason, provider_error_status(exc.reason)) from exc
    with transaction() as db:
        current = owned_profile(db, account.id, profile_id, True)
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
        account, _ = account_from_request(db, request)
        return settings_view(db.get(AccountAISettings, account.id))


@router.put("/ai-settings/account")
def update_account_settings(body: SettingsUpdate, request: Request):
    with transaction() as db:
        account, session = account_from_request(db, request, True)
        return update_account_ai_settings(db, account, session, body)

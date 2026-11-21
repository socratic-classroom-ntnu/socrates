"""後台「系統 AI」: check the form, then really send one request (spec P32、P33、P37).

Every check answers with an error code only; nothing here puts a key into an error, a log or an
exception chain. The probe goes through the iron rules like any other model call (AGENTS.md).
"""

import asyncio
from dataclasses import dataclass, replace
from typing import Literal

from pydantic import BaseModel

from sqlalchemy.orm import Session

from app.modules.admin.contracts import (
    AdminAuthor,
    DeployAuthor,
    ModelOption,
    SystemAIInput,
    SystemAIModelsInput,
    SystemAIView,
)
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.contracts import ADAPTERS, clean_credential
from app.modules.course_management import service as course_service
from app.modules.identity_access.repositories import Account
from app.modules.llm_runtime.service import guarded_generate
from app.modules.platform.errors import DomainError
from app.modules.platform.toggles import toggle_enabled

COMPATIBLE = "openai-compatible"
MODEL_LIMIT = 200  # provider_profiles.default_model
URL_LIMIT = 500  # provider_profiles.base_url
KEY_LIMIT = 500
# The whole test, /key included, stays under the ingress and tunnel limits (about 60–100 s), so
# a slow provider shows as 逾時 instead of the proxy's own error page.
PROBE_SECONDS = 45.0

_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"))


class ConnectionProbe(BaseModel):
    ok: Literal[True]


PROBE_MESSAGES = [
    {"role": "system", "content": '這是後台的連線測試。請只回 {"ok": true}。'},
    {"role": "user", "content": "測試連線"},
]


@dataclass(frozen=True)
class Draft:
    """The form after the checks that need no database and no network. `api_key` None = keep
    the stored key (spec P32)."""

    adapter: str
    model: str
    api_key: str | None
    base_url: str | None


def _blank(value: str | None) -> bool:
    return value is None or not value.translate(_ZERO_WIDTH).strip()


def check_fields(body: SystemAIInput) -> Draft:
    source = check_source(body)
    model = body.model.strip()
    if not model:
        raise DomainError("SYSTEM_AI_MODEL_REQUIRED", 422)
    if len(model) > MODEL_LIMIT:
        raise DomainError("SYSTEM_AI_MODEL_INVALID", 422)
    return replace(source, model=model)


def check_source(body: SystemAIInput | SystemAIModelsInput) -> Draft:
    """The service, key and URL checks shared by the test, the save and the model list."""
    adapter = body.adapter.strip()
    if adapter not in ADAPTERS:
        raise DomainError("SYSTEM_AI_ADAPTER_INVALID", 422)
    key: str | None = None
    if not _blank(body.api_key):
        assert body.api_key is not None
        if len(body.api_key) > KEY_LIMIT:
            raise DomainError("SYSTEM_AI_KEY_MALFORMED", 422)
        try:
            key = clean_credential(body.api_key)
        except ValueError:
            raise DomainError("SYSTEM_AI_KEY_MALFORMED", 422) from None
    base_url = None if _blank(body.base_url) else (body.base_url or "").strip()
    if adapter == COMPATIBLE:
        if base_url is None:
            raise DomainError("SYSTEM_AI_BASE_URL_REQUIRED", 422)
        if len(base_url) > URL_LIMIT:
            raise DomainError("SYSTEM_AI_BASE_URL_INVALID", 422)
    elif base_url is not None:
        raise DomainError("SYSTEM_AI_BASE_URL_NOT_ALLOWED", 422)
    return Draft(adapter=adapter, model="", api_key=key, base_url=base_url)


def with_key(draft: Draft, stored: ai_service.PlatformConfig | None) -> ai_service.PlatformConfig:
    """The full connection to test. A blank key means the saved one, but only for the same
    service at the same address: the saved key never goes anywhere else (Fizzy 11/19)."""
    same_place = (
        stored is not None
        and stored.adapter == draft.adapter
        and (stored.base_url or None) == (draft.base_url or None)
    )
    key = draft.api_key or (stored.api_key if stored is not None and same_place else None)
    if not key:
        raise DomainError("SYSTEM_AI_KEY_REQUIRED", 422)
    return ai_service.PlatformConfig(
        adapter=draft.adapter, model=draft.model, api_key=key, base_url=draft.base_url
    )


def check_base_url(config: ai_service.PlatformConfig) -> ai_service.PlatformConfig:
    """HTTPS on a public address. Resolves DNS, so call it outside any database transaction."""
    if config.adapter != COMPATIBLE:
        return config
    try:
        url = ai_service.check_base_url(config.adapter, config.base_url).strip()
    except DomainError:
        raise DomainError("SYSTEM_AI_BASE_URL_INVALID", 422) from None
    return replace(config, base_url=url)


async def _no_delta(_: str) -> None:
    return None


async def probe(config: ai_service.PlatformConfig, owner_id: str) -> ai_service.PlatformConfig:
    """Check the URL, then send one real request with this connection; any failure becomes one
    of the five kinds. Returns the connection as checked (the URL normalized), ready to save."""
    code: str | None = None
    try:
        async with asyncio.timeout(PROBE_SECONDS):
            # The URL check resolves DNS: in a thread, so a slow resolver neither blocks the
            # event loop nor escapes the time limit.
            config = await asyncio.to_thread(check_base_url, config)
            binding = ai_service.probe_binding(config, owner_id)
            if config.adapter == "openrouter" and ai_service.openrouter_key_quota(
                await ai_service.openrouter_key_info(binding)
            ):
                code = "SYSTEM_AI_QUOTA"
            else:
                await guarded_generate(
                    binding, PROBE_MESSAGES, ConnectionProbe, _no_delta, kind="connection_probe"
                )
    except TimeoutError:
        code = "SYSTEM_AI_TIMEOUT"
    except DomainError as failure:
        if failure.code.startswith("SYSTEM_AI_"):
            raise  # a field error from the URL check, already in the page's terms
        code = _sorted(config.adapter, failure)
    except Exception as failure:  # noqa: BLE001 — every failure is sorted, none escapes raw
        code = _sorted(config.adapter, failure)
    # Raised out here so the provider's exception (which holds the request) is not __context__.
    if code is not None:
        raise DomainError(code, 424)
    return config


async def models(config: ai_service.PlatformConfig, owner_id: str) -> list[ModelOption]:
    """The models this connection offers that we can use (spec P40): the URL check and the
    provider call share the probe's time limit, and a failure is sorted like a test's."""
    code: str | None = None
    listed: list[dict] = []
    try:
        async with asyncio.timeout(PROBE_SECONDS):
            config = await asyncio.to_thread(check_base_url, config)
            listed = await ai_service.list_models(ai_service.probe_binding(config, owner_id))
    except TimeoutError:
        code = "SYSTEM_AI_TIMEOUT"
    except DomainError as failure:
        if failure.code.startswith("SYSTEM_AI_"):
            raise
        code = _sorted(config.adapter, failure)
    except Exception as failure:  # noqa: BLE001 — every failure is sorted, none escapes raw
        code = _sorted(config.adapter, failure)
    if code is not None:
        raise DomainError(code, 424)
    return [
        _option(config.adapter, item)
        for item in listed
        if item.get("id") and item.get("structured_outputs") is not False and _can_chat(item)
    ]


# Lists that say nothing about structured output (OpenAI, most compatible services) still name
# models that can never answer a chat: embeddings, speech, images, moderation, legacy completions.
_NOT_CHAT = (
    "embedding",
    "whisper",
    "tts",
    "dall-e",
    "moderation",
    "transcribe",
    "gpt-image",
    "realtime",
    "davinci",
    "babbage",
    "audio",
)


def _can_chat(item: dict) -> bool:
    """Guess from the id and name only when the provider says nothing about structured output."""
    if item.get("structured_outputs") is True:
        return True
    words = f"{item.get('id')} {item.get('name') or ''}".lower()
    return not any(word in words.replace(" ", "-") or word in words for word in _NOT_CHAT)


def _option(adapter: str, item: dict) -> ModelOption:
    model_id = str(item["id"])
    name = str(item.get("name") or model_id)
    if adapter != "openrouter":
        return ModelOption(id=model_id, name=name, provider=None, free=False)
    # OpenRouter names read "Anthropic: Claude Haiku 5.5"; the provider has its own line.
    _, _, short = name.partition(": ")
    return ModelOption(
        id=model_id,
        name=short or name,
        provider=model_id.split("/", 1)[0] if "/" in model_id else None,
        free=model_id.endswith(":free") or model_id == "openrouter/free",
    )


def _sorted(adapter: str, failure: BaseException) -> str:
    try:
        return ai_service.classify_probe_failure(adapter, failure)
    except Exception:  # noqa: BLE001 — an error body nobody foresaw is still "unreachable"
        return "SYSTEM_AI_UNREACHABLE"


# ---- 讀取與寫入（transaction 內）：provider 呼叫一律在兩段 transaction 之間 ----


def snapshot(db: Session) -> float | None:
    """When the connection was last written; compared again under the lock before saving."""
    row = ai_service.platform_profile(db, course_service.practice_owner(db).id)
    return row.updated_at if row is not None else None


def current(db: Session) -> tuple[str, ai_service.PlatformConfig | None, float | None]:
    """The system account, the saved connection (for a blank form key) and the snapshot."""
    owner_id = course_service.practice_owner(db).id
    return owner_id, ai_service.usable_platform_config(db, owner_id), snapshot(db)


def save(db: Session, config: ai_service.PlatformConfig, actor_id: str, seen: float | None) -> None:
    """Write a tested connection unless someone wrote it since `seen`: the other
    admin's save, or a startup import, wins over a form tested against the older one."""
    owner = course_service.lock_practice_owner(db)
    row = ai_service.platform_profile(db, owner.id)
    if (row.updated_at if row is not None else None) != seen:
        raise DomainError("SYSTEM_AI_CHANGED", 409)
    ai_service.save_platform_profile(db, owner.id, config, actor_id)


def view(db: Session) -> SystemAIView:
    fallback = toggle_enabled(db, "system_ai_fallback")
    row = ai_service.usable_platform_profile(db, course_service.practice_owner(db).id)
    if row is None:
        return SystemAIView(
            configured=False,
            adapter=None,
            model=None,
            base_url=None,
            key_last4=None,
            updated_at=None,
            updated_by=None,
            fallback_enabled=fallback,
        )
    author = ai_service.platform_author(row)
    by: AdminAuthor | DeployAuthor = DeployAuthor()
    if author != ai_service.DEPLOY_AUTHOR:
        account = db.get(Account, author)
        by = AdminAuthor(name=account.username if account is not None else "—")
    return SystemAIView(
        configured=True,
        adapter=row.adapter,
        model=row.default_model,
        base_url=row.base_url,
        key_last4=row.secret_last4,
        updated_at=row.updated_at,
        updated_by=by,
        fallback_enabled=fallback,
    )

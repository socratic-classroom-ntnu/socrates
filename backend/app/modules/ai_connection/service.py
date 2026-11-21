"""Check a connection form, then really send one request (後台 spec P32、P33、P37、P40).

Shared by the 後台「系統 AI」page (prefix `SYSTEM_AI`) and the teacher's AI 連線設定 (prefix
`AI_CONNECTION`): the same rules, each page with its own error codes. Every check answers with an
error code only; nothing here puts a key into an error, a log or an exception chain. The probe goes
through the iron rules like any other model call (AGENTS.md).
"""

import asyncio
from dataclasses import dataclass, replace
from typing import Literal

from pydantic import BaseModel

from app.modules.ai_connection.contracts import ModelOption
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.contracts import ADAPTERS, clean_credential
from app.modules.llm_runtime.service import guarded_generate
from app.modules.platform.errors import DomainError

COMPATIBLE = "openai-compatible"
MODEL_LIMIT = 200  # provider_profiles.default_model
URL_LIMIT = 500  # provider_profiles.base_url
KEY_LIMIT = 500
# The whole test, /key included, stays under the ingress and tunnel limits (about 60–100 s), so
# a slow provider shows as 逾時 instead of the proxy's own error page.
PROBE_SECONDS = 45.0

# ai_providers.probe_errors sorts a failure into one of five kinds, named with this prefix.
_SORTED_PREFIX = "SYSTEM_AI_"

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


def _error(prefix: str, kind: str, status: int) -> DomainError:
    return DomainError(f"{prefix}_{kind}", status)


def blank(value: str | None) -> bool:
    return value is None or not value.translate(_ZERO_WIDTH).strip()


def check_fields(
    adapter: str, model: str, api_key: str | None, base_url: str | None, *, prefix: str
) -> Draft:
    source = check_source(adapter, api_key, base_url, prefix=prefix)
    model = model.strip()
    if not model:
        raise _error(prefix, "MODEL_REQUIRED", 422)
    if len(model) > MODEL_LIMIT:
        raise _error(prefix, "MODEL_INVALID", 422)
    return replace(source, model=model)


def check_source(adapter: str, api_key: str | None, base_url: str | None, *, prefix: str) -> Draft:
    """The service, key and URL checks shared by the test, the save and the model list."""
    adapter = adapter.strip()
    if adapter not in ADAPTERS:
        raise _error(prefix, "ADAPTER_INVALID", 422)
    key: str | None = None
    if not blank(api_key):
        assert api_key is not None
        if len(api_key) > KEY_LIMIT:
            raise _error(prefix, "KEY_MALFORMED", 422)
        try:
            key = clean_credential(api_key)
        except ValueError:
            raise _error(prefix, "KEY_MALFORMED", 422) from None
    url = None if blank(base_url) else (base_url or "").strip()
    if adapter == COMPATIBLE:
        if url is None:
            raise _error(prefix, "BASE_URL_REQUIRED", 422)
        if len(url) > URL_LIMIT:
            raise _error(prefix, "BASE_URL_INVALID", 422)
    elif url is not None:
        raise _error(prefix, "BASE_URL_NOT_ALLOWED", 422)
    return Draft(adapter=adapter, model="", api_key=key, base_url=url)


def with_key(
    draft: Draft, stored: ai_service.PlatformConfig | None, *, prefix: str
) -> ai_service.PlatformConfig:
    """The full connection to test. A blank key means the saved one, but only for the same
    service at the same address: the saved key never goes anywhere else (Fizzy 11/19)."""
    same_place = (
        stored is not None
        and stored.adapter == draft.adapter
        and (stored.base_url or None) == (draft.base_url or None)
    )
    key = draft.api_key or (stored.api_key if stored is not None and same_place else None)
    if not key:
        raise _error(prefix, "KEY_REQUIRED", 422)
    return ai_service.PlatformConfig(
        adapter=draft.adapter, model=draft.model, api_key=key, base_url=draft.base_url
    )


def check_base_url(config: ai_service.PlatformConfig, *, prefix: str) -> ai_service.PlatformConfig:
    """HTTPS on a public address. Resolves DNS, so call it outside any database transaction."""
    if config.adapter != COMPATIBLE:
        return config
    try:
        url = ai_service.check_base_url(config.adapter, config.base_url).strip()
    except DomainError:
        raise _error(prefix, "BASE_URL_INVALID", 422) from None
    return replace(config, base_url=url)


async def _no_delta(_: str) -> None:
    return None


async def probe(
    config: ai_service.PlatformConfig, owner_id: str, *, prefix: str
) -> ai_service.PlatformConfig:
    """Check the URL, then send one real request with this connection; any failure becomes one
    of the five kinds. Returns the connection as checked (the URL normalized), ready to save."""
    kind: str | None = None
    try:
        async with asyncio.timeout(PROBE_SECONDS):
            # The URL check resolves DNS: in a thread, so a slow resolver neither blocks the
            # event loop nor escapes the time limit.
            config = await asyncio.to_thread(check_base_url, config, prefix=prefix)
            binding = ai_service.probe_binding(config, owner_id)
            if config.adapter == "openrouter" and ai_service.openrouter_key_quota(
                await ai_service.openrouter_key_info(binding)
            ):
                kind = "QUOTA"
            else:
                await guarded_generate(
                    binding, PROBE_MESSAGES, ConnectionProbe, _no_delta, kind="connection_probe"
                )
    except TimeoutError:
        kind = "TIMEOUT"
    except DomainError as failure:
        if failure.code.startswith(f"{prefix}_"):
            raise  # a field error from the URL check, already in the page's terms
        kind = _sorted(config.adapter, failure)
    except Exception as failure:  # noqa: BLE001 — every failure is sorted, none escapes raw
        kind = _sorted(config.adapter, failure)
    # Raised out here so the provider's exception (which holds the request) is not __context__.
    if kind is not None:
        raise _error(prefix, kind, 424)
    return config


async def models(
    config: ai_service.PlatformConfig,
    owner_id: str,
    *,
    prefix: str,
    openrouter_reasoning: bool = False,
) -> list[ModelOption]:
    """The models this connection offers that we can use (spec P40): the URL check and the
    provider call share the probe's time limit, and a failure is sorted like a test's.

    `openrouter_reasoning`: also drop OpenRouter models that do not take `reasoning`, which
    every request of ours to OpenRouter carries with `require_parameters` (the teacher's list;
    the 後台 list is left as it was)."""
    kind: str | None = None
    listed: list[dict] = []
    try:
        async with asyncio.timeout(PROBE_SECONDS):
            config = await asyncio.to_thread(check_base_url, config, prefix=prefix)
            listed = await ai_service.list_models(ai_service.probe_binding(config, owner_id))
    except TimeoutError:
        kind = "TIMEOUT"
    except DomainError as failure:
        if failure.code.startswith(f"{prefix}_"):
            raise
        kind = _sorted(config.adapter, failure)
    except Exception as failure:  # noqa: BLE001 — every failure is sorted, none escapes raw
        kind = _sorted(config.adapter, failure)
    if kind is not None:
        raise _error(prefix, kind, 424)
    return [
        _option(config.adapter, item)
        for item in listed
        if item.get("id")
        and item.get("structured_outputs") is not False
        and _can_chat(item)
        and (not openrouter_reasoning or _takes_reasoning(config.adapter, item))
    ]


def _takes_reasoning(adapter: str, item: dict) -> bool:
    return adapter != "openrouter" or "reasoning" in (item.get("supported_parameters") or [])


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
    """One of the five kinds (QUOTA, MODEL_NOT_FOUND, KEY_INVALID, TIMEOUT, UNREACHABLE)."""
    try:
        code = ai_service.classify_probe_failure(adapter, failure)
    except Exception:  # noqa: BLE001 — an error body nobody foresaw is still "unreachable"
        return "UNREACHABLE"
    return code.removeprefix(_SORTED_PREFIX)

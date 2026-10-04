"""Provider adapters with bounded networking, typed JSON results, and masked audits."""

from __future__ import annotations

import ipaddress
import json
import os
import socket
import time
from urllib.parse import quote, urljoin, urlparse

import httpx

from app.orchestrator.classroom import DomainError
from app.tutor.classroom_provider import ProviderWait

KNOWN_BASE_URLS = {
    "openrouter": "https://openrouter.ai/api/v1",
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com",
}
TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


def _public_host(host: str) -> None:
    local_allow = {
        value.strip().casefold()
        for value in os.environ.get("SOCRATES_PROVIDER_LOCAL_ALLOWLIST", "").split(",")
        if value.strip()
    }
    environment = os.environ.get("SOCRATES_ENVIRONMENT", "local-dev")
    if environment != "stage" and host.casefold() in local_allow:
        return
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise DomainError("PROVIDER_HOST_RESOLUTION", 422) from exc
    if not addresses:
        raise DomainError("PROVIDER_HOST_RESOLUTION", 422)
    for value in addresses:
        address = ipaddress.ip_address(value)
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            raise DomainError("PROVIDER_PUBLIC_ADDRESS_REQUIRED", 422)


def validate_base_url(adapter: str, value: str | None) -> str:
    base = KNOWN_BASE_URLS.get(adapter) or (value or "")
    parsed = urlparse(base)
    if parsed.scheme != "https":
        local_allow = {
            item.strip().casefold()
            for item in os.environ.get("SOCRATES_PROVIDER_LOCAL_ALLOWLIST", "").split(",")
            if item.strip()
        }
        environment = os.environ.get("SOCRATES_ENVIRONMENT", "local-dev")
        if not (
            environment != "stage"
            and parsed.scheme == "http"
            and (parsed.hostname or "").casefold() in local_allow
        ):
            raise DomainError("PROVIDER_HTTPS_REQUIRED", 422)
    if parsed.username or parsed.password or not parsed.hostname:
        raise DomainError("PROVIDER_BASE_URL_REQUIRED", 422)
    if adapter == "openai-compatible":
        _public_host(parsed.hostname)
    return base.rstrip("/")


def _headers(binding: dict) -> dict[str, str]:
    adapter = binding["adapter"]
    secret = binding["secret"]
    if adapter == "anthropic":
        return {
            "x-api-key": secret,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
    if adapter == "gemini":
        return {"content-type": "application/json"}
    headers = {
        "authorization": "Bearer " + secret,
        "content-type": "application/json",
    }
    if adapter == "openrouter":
        headers["x-title"] = "Socrates"
        headers["http-referer"] = os.environ.get("SOCRATES_PUBLIC_ORIGIN", "http://localhost")
    if binding.get("organization"):
        headers["openai-organization"] = binding["organization"]
    if binding.get("project"):
        headers["openai-project"] = binding["project"]
    return headers


async def _bounded_request(
    binding: dict,
    *,
    method: str,
    path: str,
    payload: dict | None = None,
    query: dict | None = None,
    timeout=45,
) -> httpx.Response:
    base = validate_base_url(binding["adapter"], binding.get("base_url"))
    url = urljoin(base + "/", path.lstrip("/"))
    headers = _headers(binding)
    if binding["adapter"] == "gemini":
        query = {**(query or {}), "key": binding["secret"]}
    for _ in range(3):
        parsed = urlparse(url)
        if binding["adapter"] == "openai-compatible":
            _public_host(parsed.hostname or "")
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10),
            follow_redirects=False,
        ) as client:
            response = await client.request(
                method,
                url,
                json=payload,
                params=query,
                headers=headers,
            )
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location")
            if not location:
                raise ProviderWait("PROVIDER_REDIRECT_LOCATION", 60)
            url = urljoin(url, location)
            continue
        if response.status_code in TRANSIENT_STATUS:
            retry = response.headers.get("retry-after", "60")
            try:
                seconds = float(retry)
            except ValueError:
                seconds = 60
            raise ProviderWait(
                "PROVIDER_AVAILABILITY",
                max(1, min(seconds, 3600)),
            )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ProviderWait("PROVIDER_HTTP_" + str(response.status_code), 60) from exc
        if int(response.headers.get("content-length", "0") or 0) > 2_000_000:
            raise ProviderWait("PROVIDER_RESPONSE_SIZE", 60)
        return response
    raise ProviderWait("PROVIDER_REDIRECT_BOUND", 60)


def _schema_instruction(schema) -> str:
    return "\n\nReturn one JSON object matching this schema exactly:\n" + json.dumps(
        schema.model_json_schema(),
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _extract_json_text(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= start:
        return text[start : end + 1]
    return text


async def _openai_generate(binding, messages, schema):
    response = await _bounded_request(
        binding,
        method="POST",
        path="/chat/completions",
        payload={
            "model": binding["model"],
            "messages": messages,
            "stream": False,
            "max_tokens": int(os.environ.get("RUN2_MAX_OUTPUT_TOKENS", "2048")),
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "strict": True,
                    "schema": schema.model_json_schema(),
                },
            },
        },
        timeout=120,
    )
    body = response.json()
    raw = body["choices"][0]["message"]["content"]
    return (
        schema.model_validate_json(_extract_json_text(raw)).model_dump(),
        body.get("usage", {}),
        body.get("model"),
    )


async def _anthropic_generate(binding, messages, schema):
    system = "\n\n".join(item["content"] for item in messages if item.get("role") == "system")
    ordinary = [
        {
            "role": item["role"] if item["role"] in {"user", "assistant"} else "user",
            "content": item["content"],
        }
        for item in messages
        if item.get("role") != "system"
    ]
    response = await _bounded_request(
        binding,
        method="POST",
        path="/v1/messages",
        payload={
            "model": binding["model"],
            "max_tokens": int(os.environ.get("RUN2_MAX_OUTPUT_TOKENS", "2048")),
            "system": system + _schema_instruction(schema),
            "messages": ordinary,
        },
        timeout=120,
    )
    body = response.json()
    raw = "".join(
        item.get("text", "") for item in body.get("content", []) if item.get("type") == "text"
    )
    usage = body.get("usage", {})
    return (
        schema.model_validate_json(_extract_json_text(raw)).model_dump(),
        usage,
        body.get("model"),
    )


async def _gemini_generate(binding, messages, schema):
    model = quote(binding["model"], safe="-._/")
    prompt = "\n\n".join(
        f"{item.get('role', 'user')}: {item.get('content', '')}" for item in messages
    )
    response = await _bounded_request(
        binding,
        method="POST",
        path=f"/v1beta/models/{model}:generateContent",
        payload={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema.model_json_schema(),
                "maxOutputTokens": int(os.environ.get("RUN2_MAX_OUTPUT_TOKENS", "2048")),
            },
        },
        timeout=120,
    )
    body = response.json()
    raw = body["candidates"][0]["content"]["parts"][0]["text"]
    usage = body.get("usageMetadata", {})
    return schema.model_validate_json(_extract_json_text(raw)).model_dump(), usage, binding["model"]


def _estimated_cost(binding: dict, usage: dict) -> float | None:
    metadata = binding.get("metadata", {})
    input_rate = metadata.get("input_cost_per_million")
    output_rate = metadata.get("output_cost_per_million")
    if input_rate is None or output_rate is None:
        return None
    input_tokens = (
        usage.get("prompt_tokens")
        or usage.get("input_tokens")
        or usage.get("promptTokenCount")
        or 0
    )
    output_tokens = (
        usage.get("completion_tokens")
        or usage.get("output_tokens")
        or usage.get("candidatesTokenCount")
        or 0
    )
    return round(
        (float(input_tokens) * float(input_rate) + float(output_tokens) * float(output_rate))
        / 1_000_000,
        8,
    )


async def generate(binding, messages, schema, on_delta):
    started = time.monotonic()
    adapter = binding["adapter"]
    if adapter in {
        "openrouter",
        "openai",
        "openai-compatible",
    }:
        result, usage, actual_model = await _openai_generate(binding, messages, schema)
    elif adapter == "anthropic":
        result, usage, actual_model = await _anthropic_generate(binding, messages, schema)
    elif adapter == "gemini":
        result, usage, actual_model = await _gemini_generate(binding, messages, schema)
    else:
        raise ProviderWait("PROVIDER_ADAPTER_REQUIRED", 60)

    visible = result.get("reply_text") or result.get("text") or ""
    if visible:
        await on_delta(visible)
    audit = {
        "provider": adapter,
        "provider_profile_id": binding["profile_id"],
        "classroom_owner_id": binding["owner_id"],
        "requested_model": binding["model"],
        "actual_model": actual_model or binding["model"],
        "use_case": binding["role"],
        "latency_ms": round((time.monotonic() - started) * 1000),
        "token_usage": usage,
        "estimated_cost": _estimated_cost(binding, usage),
        "fallback_used": False,
    }
    return result, audit


async def discover_models(binding: dict) -> dict:
    adapter = binding["adapter"]
    if adapter == "gemini":
        response = await _bounded_request(binding, method="GET", path="/v1beta/models")
        body = response.json()
        models = [
            {
                "id": item.get("name", "").removeprefix("models/"),
                "name": item.get("displayName") or item.get("name"),
            }
            for item in body.get("models", [])
            if "generateContent" in item.get("supportedGenerationMethods", [])
        ]
    elif adapter == "anthropic":
        response = await _bounded_request(binding, method="GET", path="/v1/models")
        body = response.json()
        models = [
            {
                "id": item.get("id"),
                "name": item.get("display_name") or item.get("id"),
            }
            for item in body.get("data", [])
        ]
    else:
        response = await _bounded_request(binding, method="GET", path="/models")
        body = response.json()
        models = [
            {
                "id": item.get("id"),
                "name": item.get("name") or item.get("id"),
                "pricing": item.get("pricing"),
            }
            for item in body.get("data", [])
        ]
    return {
        "provider_profile_id": binding["profile_id"],
        "adapter": adapter,
        "models": [item for item in models if item.get("id")],
        "manual_model_id_allowed": True,
        "observed_at": time.time(),
    }


async def test_connection(binding: dict) -> dict:
    result = await discover_models(binding)
    return {
        "status": "READY",
        "provider_profile_id": binding["profile_id"],
        "adapter": binding["adapter"],
        "model_count": len(result["models"]),
        "sample": result["models"][:10],
        "observed_at": result["observed_at"],
    }

"""Sort a failed 後台 connection test into the five kinds the 系統 AI page shows (spec P33).

The status code alone does not decide the kind: a 403 is a bad key at one provider and a missing
permission at another, and a 404 from a self-hosted service is usually a wrong URL rather than a
wrong model. So each rule reads the provider's error object. The first match wins, in the order
quota → model → key → timeout; anything unmatched is "unreachable".
"""

from typing import Any

import httpx

from app.modules.ai_providers.classroom_provider import ProviderHTTPError

QUOTA = "SYSTEM_AI_QUOTA"
MODEL = "SYSTEM_AI_MODEL_NOT_FOUND"
KEY = "SYSTEM_AI_KEY_INVALID"
TIMEOUT = "SYSTEM_AI_TIMEOUT"
UNREACHABLE = "SYSTEM_AI_UNREACHABLE"

_OPENAI_QUOTA_WORDS = ("quota", "billing", "spend", "credit")


class _Error:
    """The parts of a provider error object the rules look at, lower-cased."""

    def __init__(self, status: int, error: dict[str, Any] | None):
        error = error or {}
        self.status = status
        self.message = str(error.get("message") or "").casefold()
        self.code = str(error.get("code") or "").casefold()
        self.type = str(error.get("type") or "").casefold()
        self.grpc = str(error.get("status") or "").upper()
        raw_details = error.get("details")
        details: list[Any] = raw_details if isinstance(raw_details, list) else []
        self.reasons = {
            str(d.get("reason")) for d in details if isinstance(d, dict) and d.get("reason")
        }
        self.quota_ids = [
            str(v.get("quotaId") or "")
            for d in details
            if isinstance(d, dict) and isinstance(d.get("violations"), list)
            for v in d["violations"]
            if isinstance(v, dict)
        ]
        raw_metadata = error.get("metadata")
        metadata: dict[str, Any] = raw_metadata if isinstance(raw_metadata, dict) else {}
        self.limit_source = metadata.get("limit_source")

    def says(self, *words: str) -> bool:
        return any(word in self.message for word in words)


def _quota(adapter: str, e: _Error) -> bool:
    if adapter in ("openai", "openai-compatible"):
        return e.status == 429 and any(word in e.code for word in _OPENAI_QUOTA_WORDS)
    if adapter == "anthropic":
        return e.status in (400, 429) and e.says("credit balance", "spend limit", "spending limit")
    if adapter == "gemini":
        if e.status == 402:
            return True
        per_minute = any("perminute" in quota.casefold() for quota in e.quota_ids)
        return (
            e.status == 429
            and e.grpc == "RESOURCE_EXHAUSTED"
            and not per_minute
            and e.says("quota", "spend", "billing", "prepay", "credit")
        )
    if adapter == "openrouter":
        if e.limit_source == "openrouter_in_flight_budget":
            return False
        if e.limit_source in ("openrouter_key_limit", "openrouter_credits"):
            return e.status in (402, 403)
        return e.status == 402 or (e.status == 403 and e.says("limit") and e.says("key", "credit"))
    return False


def _model(adapter: str, e: _Error) -> bool:
    if adapter in ("openai", "openai-compatible"):
        return e.code == "model_not_found" or (e.status == 404 and e.says("model"))
    if adapter == "anthropic":
        return e.status == 404 and e.type == "not_found_error" and e.says("model")
    if adapter == "gemini":
        return e.status == 404 and e.grpc == "NOT_FOUND" and e.says("models/")
    if adapter == "openrouter":
        return e.status in (400, 404) and e.says(
            "not a valid model", "no endpoints found", "model not found"
        )
    return False


def _key(adapter: str, e: _Error) -> bool:
    if e.status == 401 or e.code == "invalid_api_key":
        return True
    if adapter == "gemini":
        return e.status in (400, 403) and "API_KEY_INVALID" in e.reasons
    return False


def classify(adapter: str, failure: BaseException) -> str:
    if isinstance(failure, httpx.TimeoutException):
        return TIMEOUT
    if not isinstance(failure, ProviderHTTPError):
        return UNREACHABLE
    e = _Error(failure.status, failure.error)
    for kind, rule in ((QUOTA, _quota), (MODEL, _model), (KEY, _key)):
        if rule(adapter, e):
            return kind
    return UNREACHABLE


def openrouter_key_quota(body: Any) -> bool:
    """OpenRouter's /key says the key has no credit left (`limit_remaining` ≤ 0; null = no limit)."""
    data = body.get("data") if isinstance(body, dict) else None
    remaining = data.get("limit_remaining") if isinstance(data, dict) else None
    return isinstance(remaining, int | float) and not isinstance(remaining, bool) and remaining <= 0

"""後台「測試連線」的失敗分類（spec P33、〈介面〉測試失敗分類）：依 adapter 讀錯誤內容，比對不到歸「連不上」。"""

import httpx
import pytest

from app.modules.ai_providers.classroom_provider import ProviderHTTPError, ProviderWait
from app.modules.ai_providers.probe_errors import classify, openrouter_key_quota

QUOTA, MODEL, KEY = "SYSTEM_AI_QUOTA", "SYSTEM_AI_MODEL_NOT_FOUND", "SYSTEM_AI_KEY_INVALID"
TIMEOUT, UNREACHABLE = "SYSTEM_AI_TIMEOUT", "SYSTEM_AI_UNREACHABLE"


def http(status, error=None):
    reason = (
        "PROVIDER_AVAILABILITY"
        if status in {408, 409, 425, 429, 500, 502, 503, 504}
        else f"PROVIDER_HTTP_{status}"
    )
    return ProviderHTTPError(reason, 60, status=status, error=error)


CASES = [
    # 額度用完
    (
        "openai",
        http(429, {"code": "insufficient_quota", "message": "You exceeded your current quota"}),
        QUOTA,
    ),
    (
        "openai",
        http(429, {"code": "billing_hard_limit_reached", "message": "Billing hard limit"}),
        QUOTA,
    ),
    ("openai-compatible", http(429, {"code": "insufficient_quota", "message": "quota"}), QUOTA),
    (
        "anthropic",
        http(
            400,
            {
                "type": "invalid_request_error",
                "message": "Your credit balance is too low to access the Anthropic API.",
            },
        ),
        QUOTA,
    ),
    (
        "anthropic",
        http(
            429,
            {
                "type": "rate_limit_error",
                "message": "You have reached your specified workspace spend limit.",
            },
        ),
        QUOTA,
    ),
    (
        "gemini",
        http(
            402,
            {"status": "RESOURCE_EXHAUSTED", "message": "Your prepayment credits are depleted."},
        ),
        QUOTA,
    ),
    (
        "gemini",
        http(
            429,
            {
                "status": "RESOURCE_EXHAUSTED",
                "message": "You exceeded your current quota, please check your plan and billing details.",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [
                            {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}
                        ],
                    }
                ],
            },
        ),
        QUOTA,
    ),
    (
        "openrouter",
        http(
            402,
            {
                "code": 402,
                "message": "Insufficient credits",
                "metadata": {"limit_source": "openrouter_credits"},
            },
        ),
        QUOTA,
    ),
    (
        "openrouter",
        http(402, {"code": 402, "message": "This request requires more credits"}),
        QUOTA,
    ),
    (
        "openrouter",
        http(
            403,
            {
                "code": 403,
                "message": "Key limit exceeded",
                "metadata": {"limit_source": "openrouter_key_limit"},
            },
        ),
        QUOTA,
    ),
    ("openrouter", http(403, {"code": 403, "message": "Key limit exceeded (total limit)"}), QUOTA),
    # 模型不存在
    (
        "openai",
        http(404, {"code": "model_not_found", "message": "The model `gpt-x` does not exist"}),
        MODEL,
    ),
    (
        "openai-compatible",
        http(404, {"code": "model_not_found", "message": "model not found"}),
        MODEL,
    ),
    ("openai-compatible", http(404, {"message": "The model 'foo' does not exist"}), MODEL),
    ("anthropic", http(404, {"type": "not_found_error", "message": "model: claude-nope"}), MODEL),
    (
        "gemini",
        http(
            404,
            {
                "status": "NOT_FOUND",
                "message": "models/gemini-nope is not found for API version v1beta",
            },
        ),
        MODEL,
    ),
    (
        "openrouter",
        http(400, {"code": 400, "message": "nope/model is not a valid model ID"}),
        MODEL,
    ),
    (
        "openrouter",
        http(404, {"code": 404, "message": "No endpoints found for nope/model."}),
        MODEL,
    ),
    # 金鑰無效
    (
        "openai",
        http(401, {"code": "invalid_api_key", "message": "Incorrect API key provided"}),
        KEY,
    ),
    ("openai-compatible", http(401, None), KEY),
    ("anthropic", http(401, {"type": "authentication_error", "message": "invalid x-api-key"}), KEY),
    (
        "gemini",
        http(
            400,
            {
                "status": "INVALID_ARGUMENT",
                "message": "API key not valid. Please pass a valid API key.",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                        "reason": "API_KEY_INVALID",
                    }
                ],
            },
        ),
        KEY,
    ),
    (
        "gemini",
        http(
            403,
            {
                "status": "PERMISSION_DENIED",
                "message": "x",
                "details": [{"reason": "API_KEY_INVALID"}],
            },
        ),
        KEY,
    ),
    ("openrouter", http(401, {"code": 401, "message": "No auth credentials found"}), KEY),
    # 逾時、連不上
    ("openai", httpx.ReadTimeout("slow"), TIMEOUT),
    ("gemini", httpx.ConnectTimeout("slow"), TIMEOUT),
    ("openai-compatible", httpx.ConnectError("refused"), UNREACHABLE),
    ("openai", http(500, {"message": "server error"}), UNREACHABLE),
    (
        "openai",
        http(429, {"code": "rate_limit_exceeded", "message": "Rate limit reached"}),
        UNREACHABLE,
    ),
    ("openai", ProviderWait("PROVIDER_SCHEMA_MISMATCH", 30), UNREACHABLE),
    # 不能只看狀態碼：這些都不是它們看起來的那一類
    ("openai-compatible", http(404, {"message": "Not Found"}), UNREACHABLE),  # 網址錯，不是模型錯
    ("openai-compatible", http(404, None), UNREACHABLE),
    (
        "anthropic",
        http(
            403,
            {
                "type": "permission_error",
                "message": "Your API key does not have permission to use the specified resource.",
            },
        ),
        UNREACHABLE,
    ),
    (
        "openai",
        http(
            403,
            {"code": "unsupported_country_region_territory", "message": "Country not supported"},
        ),
        UNREACHABLE,
    ),
    (
        "openrouter",
        http(
            402,
            {
                "code": 402,
                "message": "Request exceeds in-flight budget",
                "metadata": {"limit_source": "openrouter_in_flight_budget"},
            },
        ),
        UNREACHABLE,
    ),
    (
        "gemini",
        http(
            429,
            {
                "status": "RESOURCE_EXHAUSTED",
                "message": "You exceeded your current quota.",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel"}],
                    }
                ],
            },
        ),
        UNREACHABLE,
    ),
    (
        "anthropic",
        http(
            429,
            {
                "type": "rate_limit_error",
                "message": "Number of request tokens has exceeded your per-minute rate limit",
            },
        ),
        UNREACHABLE,
    ),
]


@pytest.mark.parametrize("adapter,failure,expected", CASES)
def test_classify(adapter, failure, expected):
    assert classify(adapter, failure) == expected


def test_an_unexpected_exception_is_unreachable():
    assert classify("openai", RuntimeError("boom")) == UNREACHABLE


@pytest.mark.parametrize(
    "body,expected",
    [
        ({"data": {"limit_remaining": 0}}, True),
        ({"data": {"limit_remaining": -0.5}}, True),
        ({"data": {"limit_remaining": 3.2}}, False),
        ({"data": {"limit_remaining": None}}, False),
        ({"data": {}}, False),
        ({}, False),
        ([], False),
    ],
)
def test_openrouter_key_quota(body, expected):
    assert openrouter_key_quota(body) is expected


@pytest.mark.parametrize(
    "error",
    [
        {"details": [{"violations": 5}]},
        {"details": [{"violations": [3, None]}, "text", None]},
        {"details": "not a list", "metadata": "no"},
        {"message": 42, "code": {"x": 1}},
    ],
)
def test_odd_error_shapes_never_raise(error):
    assert classify("gemini", http(429, error)) == UNREACHABLE
    assert classify("openai-compatible", http(400, error)) == UNREACHABLE

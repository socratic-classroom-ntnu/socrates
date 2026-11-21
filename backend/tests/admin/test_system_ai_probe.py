"""系統 AI 的欄位檢查與測試連線（spec P32、P33、P37）。"""

import asyncio
import json

import httpx
import pytest

from app.modules.admin import system_ai
from app.modules.admin.contracts import SystemAIInput
from app.modules.ai_connection import service as connection
from app.modules.ai_providers import classroom_gateway as gateway
from app.modules.ai_providers.service import PlatformConfig
from app.modules.platform.errors import DomainError

KEY = "sk-or-v1-abcdefghijklmnop1234"


def fields(**overrides):
    body = {"adapter": "openrouter", "model": "openai/gpt-5-mini", "api_key": KEY, "base_url": None}
    body.update(overrides)
    return system_ai.check_fields(SystemAIInput(**body))


def code_of(call):
    with pytest.raises(DomainError) as caught:
        call()
    return caught.value.code, caught.value.status


# ---- 欄位：送出前就擋，不呼叫服務 ------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides,code",
    [
        ({"adapter": "mistral"}, "SYSTEM_AI_ADAPTER_INVALID"),
        ({"model": "  "}, "SYSTEM_AI_MODEL_REQUIRED"),
        ({"model": "m" * 201}, "SYSTEM_AI_MODEL_INVALID"),
        ({"api_key": "sk bad key"}, "SYSTEM_AI_KEY_MALFORMED"),
        ({"api_key": "k" * 501}, "SYSTEM_AI_KEY_MALFORMED"),
        ({"adapter": "openai-compatible", "base_url": None}, "SYSTEM_AI_BASE_URL_REQUIRED"),
        (
            {"adapter": "openai-compatible", "base_url": "https://x.example/" + "a" * 500},
            "SYSTEM_AI_BASE_URL_INVALID",
        ),
        ({"base_url": "https://evil.example/v1"}, "SYSTEM_AI_BASE_URL_NOT_ALLOWED"),
    ],
)
def test_field_errors(overrides, code):
    assert code_of(lambda: fields(**overrides)) == (code, 422)


def test_errors_never_carry_the_key():
    secret = "sk-" + "s" * 600
    with pytest.raises(DomainError) as caught:
        fields(api_key=secret)
    assert secret not in str(caught.value) and secret[:40] not in repr(caught.value.__dict__)


@pytest.mark.parametrize("blank", [None, "", "   "])
def test_a_blank_key_means_keep_the_current_one(blank):
    assert fields(api_key=blank).api_key is None


def test_an_empty_base_url_is_none_for_known_services():
    assert fields(base_url="").base_url is None


def test_fields_are_trimmed():
    draft = fields(model="  openai/gpt-5-mini  ", api_key=f"  {KEY}​ ")
    assert (draft.model, draft.api_key) == ("openai/gpt-5-mini", KEY)


STORED = PlatformConfig("openrouter", "old-model", "sk-stored", None)


def test_resolve_key_uses_the_stored_key_or_requires_one():
    draft = fields(api_key=None)
    assert system_ai.with_key(draft, STORED).api_key == "sk-stored"
    assert code_of(lambda: system_ai.with_key(draft, None)) == ("SYSTEM_AI_KEY_REQUIRED", 422)
    assert system_ai.with_key(fields(), STORED).api_key == KEY


def test_a_blank_key_is_kept_only_for_the_same_service_and_url():
    """Fizzy 11/19: the saved key never goes to another service or another address."""
    other_service = fields(adapter="anthropic", api_key=None)
    assert code_of(lambda: system_ai.with_key(other_service, STORED)) == (
        "SYSTEM_AI_KEY_REQUIRED",
        422,
    )
    compatible = PlatformConfig("openai-compatible", "m", "sk-stored", "https://llm.example.com/v1")
    same_url = fields(
        adapter="openai-compatible", base_url=" https://llm.example.com/v1 ", api_key=None
    )
    assert system_ai.with_key(same_url, compatible).api_key == "sk-stored"
    other_url = fields(
        adapter="openai-compatible", base_url="https://evil.example/v1", api_key=None
    )
    assert code_of(lambda: system_ai.with_key(other_url, compatible)) == (
        "SYSTEM_AI_KEY_REQUIRED",
        422,
    )


def test_base_url_is_checked_for_a_public_https_address(monkeypatch):
    config = PlatformConfig("openai-compatible", "m", KEY, "http://insecure.example/v1")
    assert code_of(lambda: system_ai.check_base_url(config)) == ("SYSTEM_AI_BASE_URL_INVALID", 422)
    monkeypatch.setattr(
        gateway.socket, "getaddrinfo", lambda *a, **k: [(0, 0, 0, "", ("10.0.0.5", 0))]
    )
    private = PlatformConfig("openai-compatible", "m", KEY, "https://intranet.example/v1")
    assert code_of(lambda: system_ai.check_base_url(private)) == ("SYSTEM_AI_BASE_URL_INVALID", 422)


# ---- 測試連線：真的送一句，經過鐵則與真的 gateway ---------------------------------------------


def transport(monkeypatch, handler):
    seen: list[httpx.Request] = []
    real = httpx.AsyncClient

    def record(request):
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(
        gateway.httpx,
        "AsyncClient",
        lambda *a, **k: real(*a, transport=httpx.MockTransport(record), **k),
    )
    return seen


def chat_ok(request):
    if request.url.path.endswith("/key"):
        return httpx.Response(200, json={"data": {"limit_remaining": None}})
    return httpx.Response(
        200, json={"choices": [{"message": {"content": '{"ok": true}'}}], "usage": {}, "model": "m"}
    )


def run_probe(config):
    return asyncio.run(system_ai.probe(config, owner_id="system-owner"))


def test_probe_sends_one_structured_request_through_the_iron_rules(monkeypatch):
    seen = transport(monkeypatch, chat_ok)
    run_probe(PlatformConfig("openai", "gpt-5-mini", KEY, None))
    (request,) = seen
    payload = json.loads(request.content)
    assert request.url.path == "/v1/chat/completions"
    assert payload["model"] == "gpt-5-mini"
    assert payload["response_format"]["json_schema"]["name"] == "ConnectionProbe"
    assert "鐵則" in payload["messages"][0]["content"]  # L1 + the probe's L2 come first


def test_openrouter_checks_the_key_quota_first(monkeypatch):
    seen = transport(monkeypatch, chat_ok)
    run_probe(PlatformConfig("openrouter", "openai/gpt-5-mini", KEY, None))
    assert [r.url.path for r in seen] == ["/api/v1/key", "/api/v1/chat/completions"]


def test_an_empty_openrouter_key_is_quota_without_generating(monkeypatch):
    seen = transport(
        monkeypatch, lambda r: httpx.Response(200, json={"data": {"limit_remaining": 0}})
    )
    assert code_of(lambda: run_probe(PlatformConfig("openrouter", "m", KEY, None))) == (
        "SYSTEM_AI_QUOTA",
        424,
    )
    assert len(seen) == 1


@pytest.mark.parametrize(
    "response,code",
    [
        (
            httpx.Response(401, json={"error": {"code": "invalid_api_key", "message": "bad"}}),
            "SYSTEM_AI_KEY_INVALID",
        ),
        (
            httpx.Response(429, json={"error": {"code": "insufficient_quota", "message": "quota"}}),
            "SYSTEM_AI_QUOTA",
        ),
        (
            httpx.Response(404, json={"error": {"code": "model_not_found", "message": "no model"}}),
            "SYSTEM_AI_MODEL_NOT_FOUND",
        ),
        (httpx.Response(503, json={"error": {"message": "down"}}), "SYSTEM_AI_UNREACHABLE"),
        (
            httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]}),
            "SYSTEM_AI_UNREACHABLE",
        ),
    ],
)
def test_probe_failures_become_the_five_kinds(monkeypatch, response, code):
    transport(monkeypatch, lambda r: response)
    with pytest.raises(DomainError) as caught:
        run_probe(PlatformConfig("openai", "gpt-5-mini", KEY, None))
    assert (caught.value.code, caught.value.status) == (code, 424)
    assert caught.value.__cause__ is None and caught.value.__context__ is None


def test_a_timeout_is_its_own_kind(monkeypatch):
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    transport(monkeypatch, slow)
    assert code_of(lambda: run_probe(PlatformConfig("openai", "m", KEY, None))) == (
        "SYSTEM_AI_TIMEOUT",
        424,
    )


def test_a_probe_that_runs_too_long_is_a_timeout(monkeypatch):
    """Under the proxies' own limits, so the page shows 逾時 instead of a gateway error."""
    import app.modules.ai_connection.service as module

    async def hangs(*args, **kwargs):
        await asyncio.sleep(5)

    monkeypatch.setattr(module, "PROBE_SECONDS", 0.05)
    monkeypatch.setattr(module, "guarded_generate", hangs)
    assert code_of(lambda: run_probe(PlatformConfig("openai", "m", KEY, None))) == (
        "SYSTEM_AI_TIMEOUT",
        424,
    )


def test_a_failure_the_sorter_cannot_read_is_still_unreachable(monkeypatch):
    transport(
        monkeypatch,
        lambda r: httpx.Response(400, json={"error": {"details": [{"violations": 5}, "x"]}}),
    )
    with pytest.raises(DomainError) as caught:
        run_probe(PlatformConfig("openai", "m", KEY, None))
    assert caught.value.code == "SYSTEM_AI_UNREACHABLE"
    assert caught.value.__context__ is None


def test_a_refused_connection_is_unreachable(monkeypatch):
    def refused(request):
        raise httpx.ConnectError("refused", request=request)

    transport(monkeypatch, refused)
    assert code_of(lambda: run_probe(PlatformConfig("openai", "m", KEY, None))) == (
        "SYSTEM_AI_UNREACHABLE",
        424,
    )


def test_a_sorter_that_breaks_still_answers_unreachable(monkeypatch):
    transport(monkeypatch, lambda r: httpx.Response(500, json={"error": {"message": "down"}}))

    def broken(adapter, failure):
        raise TypeError("an error body nobody foresaw")

    monkeypatch.setattr(system_ai.ai_service, "classify_probe_failure", broken)
    with pytest.raises(DomainError) as caught:
        run_probe(PlatformConfig("openai", "m", KEY, None))
    assert caught.value.code == "SYSTEM_AI_UNREACHABLE"
    assert caught.value.__context__ is None


def test_the_url_is_checked_inside_the_time_limit_and_off_the_event_loop(monkeypatch):
    """A slow DNS answer for a custom URL counts against the 45 s like the request itself."""
    import time

    monkeypatch.setattr(connection, "PROBE_SECONDS", 0.2)
    monkeypatch.setattr(gateway.socket, "getaddrinfo", lambda *a, **k: time.sleep(1.5) or [])
    config = PlatformConfig("openai-compatible", "m", KEY, "https://slow-dns.example/v1")

    async def answered_after() -> tuple[str, float]:
        # Timed inside the loop: asyncio.run itself waits for the resolver thread on the way out,
        # while a running server's loop answers as soon as the limit passes.
        started = time.monotonic()
        try:
            await system_ai.probe(config, owner_id="system-owner")
        except DomainError as error:
            return error.code, time.monotonic() - started
        raise AssertionError("the probe should have timed out")

    code, seconds = asyncio.run(answered_after())
    assert code == "SYSTEM_AI_TIMEOUT"
    assert seconds < 1.0


def test_a_bad_url_is_still_a_url_error_from_the_probe(monkeypatch):
    config = PlatformConfig("openai-compatible", "m", KEY, "http://insecure.example/v1")
    assert code_of(lambda: run_probe(config)) == ("SYSTEM_AI_BASE_URL_INVALID", 422)


def test_the_probe_returns_the_checked_connection(monkeypatch):
    transport(monkeypatch, chat_ok)
    monkeypatch.setattr(
        gateway.socket, "getaddrinfo", lambda *a, **k: [(0, 0, 0, "", ("93.184.216.34", 0))]
    )
    checked = run_probe(
        PlatformConfig("openai-compatible", "m", KEY, " https://llm.example.com/v1 ")
    )
    assert checked.base_url == "https://llm.example.com/v1"


def test_listing_models_uses_the_real_gateway_and_keeps_its_time_limit(monkeypatch):
    def models(request):
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "anthropic/claude-haiku-5.5",
                        "name": "Anthropic: Claude Haiku 5.5",
                        "supported_parameters": ["response_format"],
                    },
                    {"id": "x/plain", "name": "X: Plain", "supported_parameters": ["temperature"]},
                ]
            },
        )

    transport(monkeypatch, models)
    listed = asyncio.run(
        system_ai.models(PlatformConfig("openrouter", "", KEY, None), owner_id="o")
    )
    assert [m.id for m in listed] == ["anthropic/claude-haiku-5.5"]


def test_a_slow_listing_is_a_timeout(monkeypatch):
    import app.modules.ai_connection.service as module

    async def hangs(binding):
        await asyncio.sleep(5)

    monkeypatch.setattr(module, "PROBE_SECONDS", 0.05)
    monkeypatch.setattr(module.ai_service, "list_models", hangs)
    with pytest.raises(DomainError) as caught:
        asyncio.run(system_ai.models(PlatformConfig("openai", "", KEY, None), owner_id="o"))
    assert (caught.value.code, caught.value.status) == ("SYSTEM_AI_TIMEOUT", 424)

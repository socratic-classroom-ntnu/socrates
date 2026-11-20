"""金鑰不出現在網址、例外與例外鏈裡；失敗的回應帶得出分類需要的狀態碼與錯誤內容（後台 spec P37）。"""

import asyncio

import httpx
import pytest

from app.modules.ai_providers import classroom_gateway as gateway
from app.modules.ai_providers.classroom_provider import ProviderHTTPError, ProviderWait

SECRET = "AIzaSy-very-secret-key-1234"


def _binding(adapter="gemini"):
    return {"adapter": adapter, "secret": SECRET, "profile_id": "p1", "base_url": None}


def _transport(monkeypatch, handler):
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    real = httpx.AsyncClient

    def client(*args, **kwargs):
        return real(*args, transport=httpx.MockTransport(record), **kwargs)

    monkeypatch.setattr(gateway.httpx, "AsyncClient", client)
    return seen


def _request(binding, path="/v1beta/models"):
    return asyncio.run(gateway._bounded_request(binding, method="GET", path=path))


def test_gemini_key_travels_in_a_header_not_the_url(monkeypatch):
    seen = _transport(monkeypatch, lambda request: httpx.Response(200, json={"models": []}))
    _request(_binding())
    assert SECRET not in str(seen[0].url)
    assert seen[0].headers["x-goog-api-key"] == SECRET


def _failure(monkeypatch, status, body, adapter="gemini") -> ProviderWait:
    _transport(monkeypatch, lambda request: httpx.Response(status, json=body))
    with pytest.raises(ProviderWait) as caught:
        _request(_binding(adapter))
    return caught.value


def test_a_rejected_request_carries_status_and_error_but_no_secret(monkeypatch):
    body = {
        "error": {
            "code": 400,
            "status": "INVALID_ARGUMENT",
            "message": "API key not valid.",
            "details": [{"reason": "API_KEY_INVALID"}],
        }
    }
    exc = _failure(monkeypatch, 400, body)
    assert isinstance(exc, ProviderHTTPError)
    assert exc.reason == "PROVIDER_HTTP_400"
    assert exc.status == 400
    assert exc.error == body["error"]
    assert exc.__cause__ is None and exc.__context__ is None
    assert SECRET not in str(exc) and SECRET not in repr(exc.args)


def test_a_transient_status_keeps_its_reason_and_seconds(monkeypatch):
    _transport(
        monkeypatch,
        lambda request: httpx.Response(
            429, headers={"retry-after": "7"}, json={"error": {"code": 429}}
        ),
    )
    with pytest.raises(ProviderHTTPError) as caught:
        _request(_binding("openai"), "/models")
    assert caught.value.reason == "PROVIDER_AVAILABILITY"
    assert caught.value.seconds == 7
    assert caught.value.status == 429
    assert caught.value.error == {"code": 429}
    assert caught.value.__context__ is None


def test_a_long_error_message_is_cut(monkeypatch):
    exc = _failure(monkeypatch, 403, {"error": {"message": "x" * 5000}}, adapter="openai")
    assert isinstance(exc, ProviderHTTPError)
    assert len(exc.error["message"]) == 500


def test_a_non_json_error_body_gives_no_error(monkeypatch):
    _transport(monkeypatch, lambda request: httpx.Response(502, text="<html>bad gateway</html>"))
    with pytest.raises(ProviderHTTPError) as caught:
        _request(_binding("openai"), "/models")
    assert caught.value.error is None


def test_an_unfollowed_3xx_is_still_an_error(monkeypatch):
    """Anything but 2xx was an error before (raise_for_status); that stays so for every caller."""
    _transport(monkeypatch, lambda request: httpx.Response(304))
    with pytest.raises(ProviderHTTPError) as caught:
        _request(_binding("openai"), "/models")
    assert caught.value.reason == "PROVIDER_HTTP_304"

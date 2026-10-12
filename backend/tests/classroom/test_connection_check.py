"""「測試連線」要真的驗證金鑰：OpenRouter 的 /models 不需要金鑰，所以先打 /key。"""

import asyncio

import pytest

from app.tutor import classroom_gateway as gateway
from app.tutor.classroom_provider import ProviderWait


class _Response:
    def __init__(self, body):
        self._body = body

    def json(self):
        return self._body


def _binding(adapter):
    return {"adapter": adapter, "secret": "sk-test", "profile_id": "p1", "base_url": None}


def test_openrouter_test_checks_the_key_before_listing_models(monkeypatch):
    calls = []

    async def fake(binding, *, method, path, **_):
        calls.append(path)
        return _Response({"data": [{"id": "openrouter/free"}]} if path == "/models" else {"data": {"label": "k"}})

    monkeypatch.setattr(gateway, "_bounded_request", fake)
    result = asyncio.run(gateway.test_connection(_binding("openrouter")))
    assert calls == ["/key", "/models"]
    assert result["status"] == "READY" and result["model_count"] == 1


def test_rejected_key_surfaces_as_provider_http_code(monkeypatch):
    async def fake(binding, *, method, path, **_):
        raise ProviderWait("PROVIDER_HTTP_401", 60)

    monkeypatch.setattr(gateway, "_bounded_request", fake)
    with pytest.raises(ProviderWait, match="PROVIDER_HTTP_401"):
        asyncio.run(gateway.test_connection(_binding("openrouter")))


def test_other_adapters_list_models_with_the_key(monkeypatch):
    calls = []

    async def fake(binding, *, method, path, **_):
        calls.append(path)
        return _Response({"data": []})

    monkeypatch.setattr(gateway, "_bounded_request", fake)
    asyncio.run(gateway.test_connection(_binding("openai")))
    assert calls == ["/models"]

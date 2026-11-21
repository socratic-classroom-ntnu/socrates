"""呼叫紀錄的實際花費：OpenRouter 回應的 `usage.cost`（美元）存進 `estimated_cost`
（AI 連線設定需求〈呼叫的實際花費〉）；沒有才照舊用 `_estimated_cost`。"""

import asyncio
import json
import math

import pytest

from app.modules.ai_providers import classroom_gateway as gateway
from app.modules.ai_providers.classroom_provider import ProviderSchemaMismatch
from app.modules.llm_runtime.contracts import OtherSuggestionResult

REPLY = json.dumps({"suggestion_text": "新的角度"})


class FakeResponse:
    def __init__(self, body):
        self._body = body

    def json(self):
        return self._body


def binding(adapter="openrouter", metadata=None):
    return {
        "adapter": adapter,
        "model": "fixture-model",
        "profile_id": "profile-1",
        "owner_id": "owner-1",
        "role": "other_suggestion",
        "metadata": metadata or {},
    }


def audit_for(monkeypatch, usage, *, content=REPLY, call=None):
    """One call through the real OpenAI-style parsing, the provider answering with `usage`."""

    async def request(*_, **__):
        return FakeResponse({"choices": [{"message": {"content": content}}], "usage": usage})

    async def no_delta(_):
        return None

    monkeypatch.setattr(gateway, "_bounded_request", request)
    _, audit = asyncio.run(
        gateway.generate(
            call or binding(), [{"role": "user", "content": "t"}], OtherSuggestionResult, no_delta
        )
    )
    return audit


def test_openrouters_reported_cost_is_stored(monkeypatch):
    usage = {"prompt_tokens": 40, "completion_tokens": 5, "cost": 0.00123}
    assert audit_for(monkeypatch, usage)["estimated_cost"] == 0.00123


def test_a_free_call_costs_zero_not_unknown(monkeypatch):
    assert audit_for(monkeypatch, {"completion_tokens": 5, "cost": 0})["estimated_cost"] == 0


def test_without_a_cost_nothing_changes(monkeypatch):
    assert audit_for(monkeypatch, {"completion_tokens": 5})["estimated_cost"] is None


def test_without_a_cost_the_profiles_rates_still_count(monkeypatch):
    rates = {"input_cost_per_million": 1.0, "output_cost_per_million": 2.0}
    usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
    audit = audit_for(monkeypatch, usage, call=binding(metadata=rates))
    assert audit["estimated_cost"] == 3.0


@pytest.mark.parametrize("cost", ["0.1", True, -0.5, math.nan, math.inf, None, {"total": 1}])
def test_a_cost_that_is_not_a_real_amount_is_not_stored(monkeypatch, cost):
    assert audit_for(monkeypatch, {"completion_tokens": 5, "cost": cost})["estimated_cost"] is None


@pytest.mark.parametrize("adapter", ["openai", "openai-compatible"])
def test_only_openrouters_cost_is_trusted(monkeypatch, adapter):
    """Another service's `cost`, if any, is not OpenRouter's documented dollars."""
    audit = audit_for(monkeypatch, {"completion_tokens": 5, "cost": 9.9}, call=binding(adapter))
    assert audit["estimated_cost"] is None


def test_a_schema_mismatch_keeps_the_failed_calls_cost(monkeypatch):
    """The failed call was still charged; its audit carries what it cost."""
    with pytest.raises(ProviderSchemaMismatch) as caught:
        audit_for(
            monkeypatch,
            {"completion_tokens": 5, "cost": 0.0004},
            content=json.dumps({"suggestion_text": ""}),
        )
    assert caught.value.audit["estimated_cost"] == 0.0004

import asyncio
import json

import pytest

from app.modules.classroom_core.api.classroom_schemas import (
    DynamicResult,
    LLMStudentTurn,
    Observations,
    OtherSuggestionResult,
    PersonalSummary,
    PersonalTutorTurn,
    ScriptAssistResult,
    SummaryResult,
    TutorTurn,
)
from app.modules.llm_runtime.tutor import classroom_gateway as gateway
from app.modules.llm_runtime.tutor.provider_schema import (
    gemini_response_schema,
    openai_response_schema,
)


MODELS = (
    TutorTurn,
    Observations,
    PersonalTutorTurn,
    PersonalSummary,
    SummaryResult,
    DynamicResult,
    LLMStudentTurn,
    OtherSuggestionResult,
    ScriptAssistResult,
)


def walk(value):
    yield value
    if isinstance(value, dict):
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


@pytest.mark.parametrize("model", MODELS, ids=lambda model: model.__name__)
def test_openai_strict_schema_is_inline_closed_and_fully_required(model):
    schema = openai_response_schema(model)
    for value in walk(schema):
        if not isinstance(value, dict):
            continue
        assert "$ref" not in value and "$defs" not in value and "default" not in value
        if isinstance(value.get("properties"), dict):
            assert value["required"] == list(value["properties"])
            assert value["additionalProperties"] is False


@pytest.mark.parametrize("model", MODELS, ids=lambda model: model.__name__)
def test_gemini_schema_is_inline_and_uses_nullable_instead_of_null_union(model):
    schema = gemini_response_schema(model)
    for value in walk(schema):
        if not isinstance(value, dict):
            continue
        assert "$ref" not in value and "$defs" not in value
        assert "default" not in value and "additionalProperties" not in value
        any_of = value.get("anyOf")
        if isinstance(any_of, list):
            assert all(item.get("type") != "null" for item in any_of)


def test_optional_field_contracts_differ_by_provider():
    openai = openai_response_schema(LLMStudentTurn)
    gemini = gemini_response_schema(LLMStudentTurn)
    assert "option_id" in openai["required"]
    assert openai["properties"]["option_id"]["type"] == "string"
    assert gemini["properties"]["option_id"]["type"] == "string"


class FakeResponse:
    def __init__(self, body):
        self._body = body

    def json(self):
        return self._body


def test_openai_adapter_payload_uses_strict_projection(monkeypatch):
    captured = {}

    async def request(binding, **kwargs):
        captured.update(kwargs["payload"])
        content = json.dumps(
            {
                "action_mode": "answer",
                "option_id": "a",
                "text": "理由",
                "relation": "qualifies",
                "should_confirm": True,
            }
        )
        return FakeResponse(
            {"choices": [{"message": {"content": content}}], "usage": {}, "model": "fixture"}
        )

    monkeypatch.setattr(gateway, "_bounded_request", request)
    asyncio.run(
        gateway._openai_generate(
            {"model": "fixture"},
            [{"role": "user", "content": "answer"}],
            LLMStudentTurn,
        )
    )
    schema = captured["response_format"]["json_schema"]["schema"]
    assert captured["response_format"]["json_schema"]["strict"] is True
    assert schema == openai_response_schema(LLMStudentTurn)


def test_gemini_adapter_payload_uses_nullable_projection(monkeypatch):
    captured = {}

    async def request(binding, **kwargs):
        captured.update(kwargs["payload"])
        content = json.dumps(
            {
                "action_mode": "answer",
                "option_id": "a",
                "text": "理由",
                "relation": "qualifies",
                "should_confirm": True,
            }
        )
        return FakeResponse(
            {
                "candidates": [{"content": {"parts": [{"text": content}]}}],
                "usageMetadata": {},
            }
        )

    monkeypatch.setattr(gateway, "_bounded_request", request)
    asyncio.run(
        gateway._gemini_generate(
            {"model": "gemini-fixture"},
            [{"role": "user", "content": "answer"}],
            LLMStudentTurn,
        )
    )
    schema = captured["generationConfig"]["responseSchema"]
    assert schema == gemini_response_schema(LLMStudentTurn)


def _object_nodes(value):
    return [
        node
        for node in walk(value)
        if isinstance(node, dict) and isinstance(node.get("properties"), dict)
    ]


@pytest.mark.parametrize("model", MODELS)
def test_openai_schema_keeps_every_model_field_required(model):
    # 欄位名稱叫 title／default 時也要留在 properties 與 required（否則 strict schema 讓模型省略 title，AI 出題驗證失敗）。
    schema = openai_response_schema(model)
    expected = set(model.model_json_schema()["properties"])
    assert set(schema["properties"]) == expected
    assert set(schema["required"]) == expected
    for node in _object_nodes(schema):
        assert set(node["required"]) == set(node["properties"])


@pytest.mark.parametrize("model", MODELS)
def test_gemini_schema_keeps_every_model_field(model):
    schema = gemini_response_schema(model)
    assert set(schema["properties"]) == set(model.model_json_schema()["properties"])


def test_title_field_survives_while_title_annotations_go():
    schema = openai_response_schema(ScriptAssistResult)
    assert "title" in schema["properties"] and "title" in schema["required"]
    assert "title" not in schema["properties"]["title"]
    gemini = gemini_response_schema(ScriptAssistResult)
    assert "title" in gemini["properties"] and "title" not in gemini["properties"]["title"]

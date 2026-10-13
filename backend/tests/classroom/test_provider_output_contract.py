import asyncio
import json
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.classroom_schemas import OtherSuggestionResult
from app.classroom_app import create_app
from app.repositories import classroom_storage as storage
from app.tutor import classroom_gateway as gateway
from app.tutor.classroom_provider import ProviderWait


class FakeResponse:
    def __init__(self, body):
        self._body = body

    def json(self):
        return self._body


def binding(adapter: str) -> dict:
    return {
        "adapter": adapter,
        "model": "fixture-model",
        "profile_id": "profile-1",
        "owner_id": "owner-1",
        "role": "other_suggestion",
    }


@pytest.mark.parametrize(
    ("adapter", "body", "runner"),
    [
        (
            "openrouter",
            {"choices": [{"message": {"content": None}}], "usage": {}, "model": "fixture"},
            gateway._openai_generate,
        ),
        (
            "anthropic",
            {"content": [], "usage": {}, "model": "fixture"},
            gateway._anthropic_generate,
        ),
        (
            "gemini",
            {"candidates": [{"content": {"parts": [{"text": None}]}}], "usageMetadata": {}},
            gateway._gemini_generate,
        ),
    ],
)
def test_provider_empty_content_becomes_provider_wait(monkeypatch, adapter, body, runner):
    async def request(*_, **__):
        return FakeResponse(body)

    monkeypatch.setattr(gateway, "_bounded_request", request)
    with pytest.raises(ProviderWait, match="PROVIDER_EMPTY_CONTENT"):
        asyncio.run(
            runner(binding(adapter), [{"role": "user", "content": "test"}], OtherSuggestionResult)
        )


@pytest.mark.parametrize("raw", ["not json", '{"unexpected": true}'])
def test_invalid_or_mismatched_json_becomes_provider_wait(raw):
    with pytest.raises(ProviderWait, match="PROVIDER_SCHEMA_MISMATCH"):
        gateway._validated_structured_result(raw, OtherSuggestionResult)


def test_openrouter_requires_structured_output_capability(monkeypatch):
    captured = {}

    async def request(*_, **kwargs):
        captured.update(kwargs["payload"])
        return FakeResponse(
            {
                "choices": [{"message": {"content": json.dumps({"suggestion_text": "新的角度"})}}],
                "usage": {},
                "model": "fixture-model",
            }
        )

    monkeypatch.setattr(gateway, "_bounded_request", request)
    asyncio.run(
        gateway._openai_generate(
            binding("openrouter"),
            [{"role": "user", "content": "test"}],
            OtherSuggestionResult,
        )
    )
    assert captured["provider"] == {"require_parameters": True}


def test_openrouter_model_capabilities_are_exposed(monkeypatch):
    async def request(*_, **__):
        return FakeResponse(
            {
                "data": [
                    {
                        "id": "structured-model",
                        "name": "Structured",
                        "supported_parameters": ["response_format", "tools"],
                    },
                    {
                        "id": "plain-model",
                        "name": "Plain",
                        "supported_parameters": ["tools"],
                    },
                ]
            }
        )

    monkeypatch.setattr(gateway, "_bounded_request", request)
    result = asyncio.run(gateway.discover_models(binding("openrouter")))
    first, second = result["models"]
    assert first["structured_outputs"] is True
    assert first["supported_parameters"] == ["response_format", "tools"]
    assert second["structured_outputs"] is False


DOC = {
    "title": "倫理",
    "mode": "static",
    "questions": [
        {
            "id": "q",
            "title": "題目",
            "scenario": "抉擇",
            "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
            "duration_seconds": 120,
            "max_focus_turns": 2,
            "scenario_ai": None,
        }
    ],
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CLASSROOM_COOKIE_SECURE", "false")
    monkeypatch.setenv("SOCRATES_ALLOWED_ORIGINS", "http://testserver")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    monkeypatch.delenv("SOCRATES_PROVIDER_MASTER_KEY", raising=False)
    storage.configure("sqlite://", create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as test_client:
        yield test_client


def login(test_client, name: str) -> None:
    password = "Socratic-123456"
    if (
        test_client.post(
            "/api/v2/auth/login", json={"login": name, "password": password}
        ).status_code
        != 200
    ):
        body = {"username": name, "email": name + "@example.org", "password": password}
        assert test_client.post("/api/v2/auth/register", json=body).status_code == 200
        with storage.transaction() as db:
            mail = db.scalars(select(storage.Mail)).all()[-1]
            token = re.search(r"verify_token=(\S+)", mail.body)[1]
        assert test_client.post("/api/v2/auth/verify", json={"token": token}).status_code == 200
    response = test_client.post("/api/v2/auth/login", json={"login": name, "password": password})
    assert response.status_code == 200
    test_client.headers["X-CSRF-Token"] = response.json()["csrf_token"]


def configure_ai(test_client) -> None:
    profile = test_client.post(
        "/api/v2/provider-profiles",
        json={
            "name": "OpenRouter",
            "adapter": "openrouter",
            "default_model": "openrouter/free",
            "credential": "sk-or-test",
        },
    )
    assert profile.status_code == 200, profile.text
    response = test_client.put(
        "/api/v2/ai-settings/account",
        json={
            "default_profile_id": profile.json()["id"],
            "model_matrix": {
                "ai_script_authoring": "openrouter/free",
                "other_suggestion": "openrouter/free",
            },
        },
    )
    assert response.status_code == 200, response.text


def test_provider_contract_failures_surface_as_503_codes(client, monkeypatch):
    async def fail(_binding, _messages, schema, _on_delta):
        reason = (
            "PROVIDER_EMPTY_CONTENT"
            if schema.__name__ == "ScriptAssistResult"
            else "PROVIDER_SCHEMA_MISMATCH"
        )
        raise ProviderWait(reason, 30)

    monkeypatch.setattr(gateway, "generate", fail)
    login(client, "teacher")
    configure_ai(client)

    assist = client.post(
        "/api/v2/scripts/assist",
        json={"request": "提出新角度", "document": DOC},
    )
    assert assist.status_code == 503
    assert assist.json()["detail"] == "PROVIDER_EMPTY_CONTENT"

    suggestion = client.post(
        "/api/v2/suggestions/other",
        json={
            "question_id": "q",
            "title": "題目",
            "scenario": "抉擇",
            "existing_options": ["甲", "乙"],
        },
    )
    assert suggestion.status_code == 503
    assert suggestion.json()["detail"] == "PROVIDER_SCHEMA_MISMATCH"

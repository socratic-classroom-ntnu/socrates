"""POST /ai-settings/connection/models：表單的服務、金鑰（可空＝沿用）、網址 → 模型清單。

沿用後台系統 AI 的規則（能對話、支援結構化輸出、免費標籤）；OpenRouter 另外要支援 reasoning，
因為我們送給 OpenRouter 的請求一定帶 `reasoning` 和 `require_parameters`（需求〈設定表單〉）。
"""

import asyncio
import logging

import httpx
import pytest

from app.modules.ai_connection import service as checks
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.service import PlatformConfig
from tests.admin.test_system_ai_probe import transport
from tests.ai_connection.test_connection_apply import KEY, code
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import configure_ai

PATH = "/api/v2/ai-settings/connection/models"
OLD_KEY = "sk-or-test"  # what configure_ai saves

OPENROUTER = [
    {
        "id": "anthropic/claude-haiku-5.5",
        "name": "Anthropic: Claude Haiku 5.5",
        "supported_parameters": ["response_format", "reasoning"],
        "structured_outputs": True,
    },
    {
        # Structured output but no reasoning: OpenRouter refuses our request for it.
        "id": "x/no-reasoning",
        "name": "X: No Reasoning",
        "supported_parameters": ["response_format"],
        "structured_outputs": True,
    },
    {
        "id": "y/no-structure",
        "name": "Y: No Structure",
        "supported_parameters": ["reasoning"],
        "structured_outputs": False,
    },
    {
        "id": "z/free:free",
        "name": "Z: Free",
        "supported_parameters": ["response_format", "reasoning", "include_reasoning"],
        "structured_outputs": True,
    },
]
OPENAI = [
    {
        "id": "gpt-5-mini",
        "name": "gpt-5-mini",
        "supported_parameters": [],
        "structured_outputs": None,
    },
    {
        "id": "text-embedding-3",
        "name": "text-embedding-3",
        "supported_parameters": [],
        "structured_outputs": None,
    },
]


@pytest.fixture
def teacher(client):
    return user(client, "owner", account_role="teacher")["id"]


@pytest.fixture
def listed(monkeypatch):
    """The provider's list, faked; records the binding each listing used."""
    asked: list[dict] = []

    async def fake(binding):
        asked.append(binding)
        return OPENROUTER if binding["adapter"] == "openrouter" else OPENAI

    monkeypatch.setattr(ai_service, "list_models", fake)
    return asked


def models(client, **form):
    response = client.post(PATH, json=form)
    assert response.status_code == 200, response.text
    return response.json()["models"]


def test_openrouter_lists_only_models_that_take_our_request(client, teacher, listed):
    assert models(client, adapter="openrouter", api_key=KEY) == [
        {
            "id": "anthropic/claude-haiku-5.5",
            "name": "Claude Haiku 5.5",
            "provider": "anthropic",
            "free": False,
        },
        {"id": "z/free:free", "name": "Free", "provider": "z", "free": True},
    ]
    assert listed[0]["secret"] == KEY


def test_other_services_keep_the_shared_rules(client, teacher, listed):
    assert models(client, adapter="openai", api_key=KEY) == [
        {"id": "gpt-5-mini", "name": "gpt-5-mini", "provider": None, "free": False}
    ]


def test_the_admins_list_still_keeps_models_without_reasoning(listed):
    config = PlatformConfig("openrouter", "", KEY, None)
    listed_ids = [m.id for m in asyncio.run(checks.models(config, "o", prefix="SYSTEM_AI"))]
    assert "x/no-reasoning" in listed_ids


def test_a_blank_key_lists_with_the_saved_one(client, teacher, listed):
    configure_ai(client)
    models(client, adapter="openrouter")
    assert listed[0]["secret"] == OLD_KEY


def test_the_saved_key_never_goes_to_another_service(client, teacher, listed):
    configure_ai(client)
    assert code(client.post(PATH, json={"adapter": "openai"})) == (
        422,
        "AI_CONNECTION_KEY_REQUIRED",
    )
    assert listed == []


def test_without_any_key_nothing_is_asked(client, teacher, listed):
    assert code(client.post(PATH, json={"adapter": "openrouter"})) == (
        422,
        "AI_CONNECTION_KEY_REQUIRED",
    )
    assert listed == []


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ({"adapter": "nope", "api_key": KEY}, "AI_CONNECTION_ADAPTER_INVALID"),
        ({"adapter": "openai-compatible", "api_key": KEY}, "AI_CONNECTION_BASE_URL_REQUIRED"),
        (
            {"adapter": "openrouter", "api_key": KEY, "base_url": "https://x.example"},
            "AI_CONNECTION_BASE_URL_NOT_ALLOWED",
        ),
        ({"adapter": "openrouter", "api_key": "sk bad\nkey"}, "AI_CONNECTION_KEY_MALFORMED"),
    ],
)
def test_field_errors_are_codes_and_nothing_is_asked(client, teacher, listed, form, expected):
    response = client.post(PATH, json=form)
    assert code(response) == (422, expected)
    assert KEY not in response.text
    assert listed == []


def test_a_saved_compatible_service_with_a_trailing_slash_keeps_its_key(
    client, teacher, listed, probes, monkeypatch
):
    monkeypatch.setattr(checks, "check_base_url", lambda config, *, prefix: config)
    form = {"adapter": "openai-compatible", "model": "m", "base_url": "https://llm.school.edu/v1"}
    assert (
        client.put("/api/v2/ai-settings/connection", json={**form, "api_key": KEY}).status_code
        == 200
    )
    models(client, adapter="openai-compatible", base_url="https://llm.school.edu/v1/")
    assert listed[0]["secret"] == KEY


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (
            httpx.Response(401, json={"error": {"code": "invalid_api_key", "message": "bad"}}),
            "AI_CONNECTION_KEY_INVALID",
        ),
        (httpx.Response(503, json={"error": {"message": "down"}}), "AI_CONNECTION_UNREACHABLE"),
    ],
)
def test_a_failed_listing_answers_with_its_kind(client, teacher, monkeypatch, response, expected):
    """Through the real gateway, as the 後台 tests do."""
    transport(monkeypatch, lambda request: response)
    result = client.post(PATH, json={"adapter": "openai", "api_key": KEY})
    assert code(result) == (424, expected)
    assert KEY not in result.text


def test_a_student_account_is_refused(client, listed):
    user(client, "ming", account_role="student")
    assert code(client.post(PATH, json={"adapter": "openrouter", "api_key": KEY})) == (
        403,
        "ACCOUNT_ROLE_FORBIDDEN",
    )
    assert listed == []


def test_listing_needs_the_csrf_token(client, teacher, listed):
    del client.headers["X-CSRF-Token"]
    assert client.post(PATH, json={"adapter": "openrouter", "api_key": KEY}).status_code == 403


def test_a_malformed_body_does_not_echo_the_key(client, teacher, listed):
    response = client.post(PATH, json={"api_key": KEY})
    assert response.status_code == 422
    assert KEY not in response.text


def test_nothing_is_logged_with_the_key(client, teacher, listed, caplog):
    caplog.set_level(logging.DEBUG)
    models(client, adapter="openrouter", api_key=KEY)
    assert KEY not in caplog.text


def test_openrouters_real_answer_is_filtered_through_the_gateway(client, teacher, monkeypatch):
    """The fields as OpenRouter's /models sends them, read by the real gateway."""

    def answer(request):
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "openai/gpt-5-mini",
                        "name": "OpenAI: GPT-5 Mini",
                        "supported_parameters": ["response_format", "reasoning", "max_tokens"],
                    },
                    {
                        "id": "meta/llama-x",
                        "name": "Meta: Llama X",
                        "supported_parameters": ["response_format", "max_tokens"],
                    },
                ]
            },
        )

    transport(monkeypatch, answer)
    assert [m["id"] for m in models(client, adapter="openrouter", api_key=KEY)] == [
        "openai/gpt-5-mini"
    ]

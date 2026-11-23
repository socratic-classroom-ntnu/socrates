"""GET /ai-settings/connection/usage：我的用量（需求〈我的用量〉）。

OpenRouter 用老師自己金鑰的 `GET /api/v1/key`：有上限＝上限、剩餘、已用＝上限−剩餘；沒上限＝
累計已用。其他服務「查不到」；查詢失敗另外一種。只在自己的金鑰在用時有用量。
"""

import logging

import httpx
import pytest

from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import ProviderProfile
from app.modules.platform import storage
from tests.ai_connection.test_connection_apply import KEY, code
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import configure_ai

PATH = "/api/v2/ai-settings/connection/usage"
OLD_KEY = "sk-or-test"  # what configure_ai saves
NONE = {
    "status": "none",
    "adapter": None,
    "used": None,
    "limit": None,
    "remaining": None,
    "limit_reset": None,
}


@pytest.fixture
def teacher(client):
    return user(client, "owner", account_role="teacher")["id"]


@pytest.fixture
def key_info(monkeypatch):
    """OpenRouter's /key, faked: set `body` to its answer or `error` to an exception."""
    state: dict = {"body": None, "error": None, "asked": []}

    async def fake(binding):
        state["asked"].append(binding)
        if state["error"] is not None:
            raise state["error"]
        return state["body"]

    monkeypatch.setattr(ai_service, "openrouter_key_info", fake)
    return state


def usage(client):
    response = client.get(PATH)
    assert response.status_code == 200, response.text
    return response.json()


def test_a_key_with_a_limit(client, teacher, key_info):
    configure_ai(client)
    key_info["body"] = {
        "data": {"limit": 20, "limit_remaining": 15.04, "usage": 30, "limit_reset": None}
    }
    assert usage(client) == {
        "status": "ok",
        "adapter": "openrouter",
        "used": pytest.approx(4.96),
        "limit": 20,
        "remaining": 15.04,
        "limit_reset": None,
    }
    # With the teacher's own key, never a key in the answer.
    assert key_info["asked"][0]["secret"] == OLD_KEY


@pytest.mark.parametrize("reset", ["daily", "weekly", "monthly"])
def test_a_limit_that_resets(client, teacher, key_info, reset):
    configure_ai(client)
    key_info["body"] = {"data": {"limit": 5, "limit_remaining": 5, "limit_reset": reset}}
    body = usage(client)
    assert (body["limit_reset"], body["used"]) == (reset, 0)


def test_an_unknown_reset_is_not_shown(client, teacher, key_info):
    configure_ai(client)
    key_info["body"] = {"data": {"limit": 5, "limit_remaining": 1, "limit_reset": "hourly"}}
    assert usage(client)["limit_reset"] is None


def test_a_key_without_a_limit_shows_what_it_used(client, teacher, key_info):
    configure_ai(client)
    key_info["body"] = {"data": {"limit": None, "limit_remaining": None, "usage": 12.5}}
    assert usage(client) == {
        "status": "ok",
        "adapter": "openrouter",
        "used": 12.5,
        "limit": None,
        "remaining": None,
        "limit_reset": None,
    }


@pytest.mark.parametrize("remaining", [0, -0.37])
def test_nothing_left_is_reported_as_it_is(client, teacher, key_info, remaining):
    configure_ai(client)
    key_info["body"] = {"data": {"limit": 10, "limit_remaining": remaining}}
    body = usage(client)
    assert body["remaining"] == remaining
    assert body["used"] == pytest.approx(10 - remaining)


@pytest.mark.parametrize("adapter", ["openai", "anthropic", "gemini"])
def test_other_services_cannot_be_asked(client, teacher, key_info, adapter):
    profile_id = configure_ai(client)
    with storage.transaction() as db:
        db.get(ProviderProfile, profile_id).adapter = adapter
    assert usage(client) == {**NONE, "status": "unsupported", "adapter": adapter}
    assert key_info["asked"] == []


@pytest.mark.parametrize(
    "error",
    [
        TimeoutError(),
        httpx.ConnectError("down"),
        httpx.HTTPStatusError(
            "401",
            request=httpx.Request("GET", "https://openrouter.ai/api/v1/key"),
            response=httpx.Response(401),
        ),
    ],
)
def test_a_failed_query_is_its_own_answer(client, teacher, key_info, error, caplog):
    configure_ai(client)
    key_info["error"] = error
    caplog.set_level(logging.DEBUG)
    assert usage(client) == {**NONE, "status": "failed", "adapter": "openrouter"}
    assert OLD_KEY not in caplog.text


@pytest.mark.parametrize(
    "body",
    [None, {}, {"data": None}, {"data": {"limit": "lots"}}, {"data": {"limit": 5}}, {"data": {}}],
)
def test_an_answer_that_cannot_be_read_is_a_failure(client, teacher, key_info, body):
    configure_ai(client)
    key_info["body"] = body
    assert usage(client)["status"] == "failed"


def test_the_system_ai_has_no_usage_here(client, teacher, key_info):
    assert usage(client) == NONE
    profile_id = configure_ai(client)
    with storage.transaction() as db:
        db.get(ProviderProfile, profile_id).enabled = False
    assert usage(client) == NONE
    assert key_info["asked"] == []


def test_a_key_no_longer_usable_is_not_asked(client, teacher, key_info):
    profile_id = configure_ai(client)
    with storage.transaction() as db:
        db.get(ProviderProfile, profile_id).encrypted_secret = "no-longer-decrypts"
    assert usage(client) == NONE
    assert key_info["asked"] == []


def test_a_student_account_is_refused(client, key_info):
    user(client, "ming", account_role="student")
    assert code(client.get(PATH)) == (403, "ACCOUNT_ROLE_FORBIDDEN")


def test_the_key_never_comes_back(client, teacher, key_info, probes):
    client.put(
        "/api/v2/ai-settings/connection",
        json={"adapter": "openrouter", "model": "m", "api_key": KEY},
    )
    key_info["body"] = {"data": {"limit": None, "usage": 1, "label": KEY}}
    response = client.get(PATH)
    assert response.status_code == 200
    assert KEY not in response.text

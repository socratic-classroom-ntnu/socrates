"""後台「系統 AI」API（spec P30–P34、P37、〈介面〉）。"""

import json
import logging

import httpx
import pytest
from sqlalchemy import select

from app.modules.admin import system_ai
from app.modules.ai_providers import classroom_gateway as gateway
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import ProviderProfile
from app.modules.app_shell import practice_startup
from app.modules.course_management import service as course_service
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from tests.admin.test_admin_api import make_admin
from tests.course_management.conftest import user

PATH = "/api/v2/admin/system-ai"
KEY = "sk-or-v1-admin-pasted-key-7777"
ENV_KEY = "sk-or-v1-from-the-deploy-0001"
FORM = {"adapter": "openrouter", "model": "openai/gpt-5-mini", "api_key": KEY}


@pytest.fixture
def admin(client):
    account = user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    return account


@pytest.fixture
def probes(monkeypatch):
    """Every connection the API tried, in order; set `fail` to a code to make the next one fail."""
    tried: list[ai_service.PlatformConfig] = []
    state = {"fail": None, "during": None}

    async def fake(config, owner_id):
        tried.append(config)
        if state["during"]:
            state.pop("during")()
        if state["fail"]:
            raise DomainError(state["fail"], 424)
        return config

    monkeypatch.setattr(system_ai, "probe", fake)
    return tried, state


def owner_id():
    with storage.transaction() as db:
        return course_service.practice_owner(db).id


def from_env(model="env-model"):
    config = ai_service.PlatformConfig("openrouter", model, ENV_KEY, None)
    practice_startup.prepare_practice(lambda: config)


def platform():
    with storage.transaction() as db:
        return db.scalar(select(ProviderProfile).where(ProviderProfile.owner_id == owner_id()))


# ---- 誰能用 ----------------------------------------------------------------------------------


def test_non_admins_get_not_found_even_with_a_malformed_body(client):
    for method, body in (("GET", None), ("POST", {"adapter": 17}), ("PUT", {"api_key": KEY})):
        url = PATH + ("/test" if method == "POST" else "")
        response = client.request(method, url, json=body)
        assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")
        assert KEY not in response.text
    user(client, "mei")
    assert client.get(PATH).status_code == 404


def test_writes_need_the_csrf_token(client, admin, probes):
    client.headers["X-CSRF-Token"] = "wrong"
    for url, method in ((PATH + "/test", "POST"), (PATH, "PUT")):
        response = client.request(method, url, json=FORM)
        assert (response.status_code, response.json()["detail"]) == (403, "SESSION_CSRF_REQUIRED")
    assert probes[0] == []


# ---- 讀取 ------------------------------------------------------------------------------------


def test_nothing_set_up_yet(client, admin):
    assert client.get(PATH).json() == {
        "configured": False,
        "adapter": None,
        "model": None,
        "base_url": None,
        "key_last4": None,
        "updated_at": None,
        "updated_by": None,
        "fallback_enabled": False,
    }


def test_a_disabled_connection_counts_as_not_set_up(client, admin):
    from_env()
    with storage.transaction() as db:
        db.scalar(select(ProviderProfile)).enabled = False
    assert client.get(PATH).json()["configured"] is False


def test_an_env_import_reads_as_the_deploy_setting_and_never_shows_the_key(client, admin):
    from_env()
    response = client.get(PATH)
    body = response.json()
    assert body["configured"] is True
    assert (body["adapter"], body["model"], body["key_last4"]) == (
        "openrouter",
        "env-model",
        "0001",
    )
    assert body["updated_by"] == {"kind": "deploy"}
    assert body["updated_at"] > 0
    assert ENV_KEY not in response.text


def test_a_connection_from_before_the_back_office_reads_as_the_deploy_setting(client, admin):
    from_env()
    with storage.transaction() as db:
        db.scalar(select(ProviderProfile)).metadata_json = {}
    assert client.get(PATH).json()["updated_by"] == {"kind": "deploy"}


def test_the_fallback_switch_is_reported(client, admin):
    client.put("/api/v2/admin/toggles/system_ai_fallback", json={"enabled": True})
    assert client.get(PATH).json()["fallback_enabled"] is True


# ---- 測試連線 --------------------------------------------------------------------------------


def test_testing_tries_the_form_without_saving(client, admin, probes):
    tried, _ = probes
    response = client.post(PATH + "/test", json=FORM)
    assert (response.status_code, response.json()) == (200, {"ok": True})
    assert [(c.adapter, c.model, c.api_key) for c in tried] == [
        ("openrouter", "openai/gpt-5-mini", KEY)
    ]
    assert platform() is None


def test_a_blank_key_tests_the_saved_one(client, admin, probes):
    tried, _ = probes
    from_env()
    for blank in ({}, {"api_key": None}, {"api_key": ""}):
        body = {"adapter": "openrouter", "model": "m2", **blank}
        assert client.post(PATH + "/test", json=body).status_code == 200
    assert {c.api_key for c in tried} == {ENV_KEY}


def test_a_blank_key_with_nothing_saved_is_refused(client, admin, probes):
    response = client.post(PATH + "/test", json={"adapter": "openrouter", "model": "m"})
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_KEY_REQUIRED")
    assert probes[0] == []


def test_a_failed_test_answers_with_its_kind(client, admin, probes):
    probes[1]["fail"] = "SYSTEM_AI_MODEL_NOT_FOUND"
    response = client.post(PATH + "/test", json=FORM)
    assert (response.status_code, response.json()["detail"]) == (424, "SYSTEM_AI_MODEL_NOT_FOUND")


def test_a_bad_gemini_key_never_comes_back(client, admin, monkeypatch, caplog):
    secret = "AIzaSy-admin-secret-key-4242"
    real = httpx.AsyncClient
    body = {
        "error": {
            "code": 400,
            "status": "INVALID_ARGUMENT",
            "message": "API key not valid.",
            "details": [{"reason": "API_KEY_INVALID"}],
        }
    }
    transport = httpx.MockTransport(lambda request: httpx.Response(400, json=body))
    monkeypatch.setattr(
        gateway.httpx, "AsyncClient", lambda *a, **k: real(*a, transport=transport, **k)
    )
    caplog.set_level(logging.DEBUG)
    response = client.post(
        PATH + "/test", json={"adapter": "gemini", "model": "gemini-2.5-flash", "api_key": secret}
    )
    assert (response.status_code, response.json()["detail"]) == (424, "SYSTEM_AI_KEY_INVALID")
    assert secret not in response.text and secret not in caplog.text


@pytest.mark.parametrize(
    "body",
    [
        {"adapter": 17, "model": "m", "api_key": "sk-leak-me-0001"},
        {"adapter": "openai", "model": "m", "api_key": {"value": "sk-leak-me-0001"}},
        {"adapter": "openai", "model": ["m"], "api_key": "sk-leak-me-0001"},
    ],
)
def test_a_malformed_body_from_an_admin_does_not_echo_the_key(client, admin, caplog, body):
    caplog.set_level(logging.DEBUG)
    for method, url in (("POST", PATH + "/test"), ("PUT", PATH)):
        response = client.request(method, url, json=body)
        assert response.status_code == 422
        assert "sk-leak-me-0001" not in response.text and "sk-leak-me-0001" not in caplog.text


def test_other_paths_keep_the_usual_validation_errors(client, admin):
    response = client.post("/api/v2/admin/admins", json={"username": 17})
    assert response.status_code == 422
    assert "input" in response.json()["detail"][0]


def test_field_errors_are_codes(client, admin, probes):
    response = client.post(PATH + "/test", json={**FORM, "model": "m" * 201})
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_MODEL_INVALID")
    response = client.put(PATH, json={**FORM, "api_key": "k" * 600})
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_KEY_MALFORMED")
    assert "k" * 600 not in response.text
    assert probes[0] == []


# ---- 儲存 ------------------------------------------------------------------------------------


def test_saving_tests_again_then_takes_effect_at_once(client, admin, probes):
    tried, _ = probes
    from_env()
    response = client.put(PATH, json={**FORM, "model": "new-model"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["model"], body["key_last4"], body["updated_by"]) == (
        "new-model",
        "7777",
        {"kind": "admin", "name": "fizzy"},
    )
    assert len(tried) == 1  # the backend tests it again; it does not trust the page
    with storage.transaction() as db:
        binding = ai_service.platform_binding(db, owner_id(), "socratic_tutor")
    assert (binding["model"], binding["secret"]) == ("new-model", KEY)


def test_saving_only_a_new_model_keeps_the_key(client, admin, probes):
    from_env()
    assert (
        client.put(PATH, json={"adapter": "openrouter", "model": "m3", "api_key": ""}).status_code
        == 200
    )
    with storage.transaction() as db:
        binding = ai_service.platform_binding(db, owner_id(), "socratic_tutor")
    assert (binding["model"], binding["secret"]) == ("m3", ENV_KEY)


def test_a_failed_save_changes_nothing(client, admin, probes):
    from_env()
    probes[1]["fail"] = "SYSTEM_AI_QUOTA"
    response = client.put(PATH, json={**FORM, "model": "new-model"})
    assert (response.status_code, response.json()["detail"]) == (424, "SYSTEM_AI_QUOTA")
    assert platform().default_model == "env-model"


def test_the_first_save_sets_it_up(client, admin, probes):
    assert client.put(PATH, json=FORM).json()["configured"] is True
    with storage.transaction() as db:
        assert ai_service.platform_binding(db, owner_id(), "socratic_tutor")["secret"] == KEY


def test_someone_removed_during_the_test_cannot_save(client, admin, probes):
    _, state = probes

    def removed():
        with storage.transaction() as db:
            db.scalar(select(Account).where(Account.username == "fizzy")).platform_role = None

    state["during"] = removed
    response = client.put(PATH, json=FORM)
    assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")
    assert platform() is None


def test_a_save_that_lands_during_the_test_wins_over_the_older_form(client, admin, probes):
    """Admin A tests with a blank key (the old key); admin B saves meanwhile; A must not put the
    old key back."""
    _, state = probes
    from_env()

    def other_admin_saves():
        with storage.transaction() as db:
            config = ai_service.PlatformConfig("openrouter", "b-model", "sk-or-v1-b-key-0002", None)
            system_ai.save(db, config, "b-admin-id", system_ai.snapshot(db))

    state["during"] = other_admin_saves
    response = client.put(PATH, json={"adapter": "openrouter", "model": "a-model", "api_key": ""})
    assert (response.status_code, response.json()["detail"]) == (409, "SYSTEM_AI_CHANGED")
    with storage.transaction() as db:
        binding = ai_service.platform_binding(db, owner_id(), "socratic_tutor")
    assert (binding["model"], binding["secret"]) == ("b-model", "sk-or-v1-b-key-0002")


def test_a_saved_key_is_never_in_any_response(client, admin, probes):
    responses = [
        client.put(PATH, json=FORM),
        client.get(PATH),
        client.post(PATH + "/test", json=FORM),
    ]
    assert all(KEY not in json.dumps(r.json()) for r in responses)


def test_switching_service_needs_the_key_again(client, admin, probes):
    from_env()
    body = {"adapter": "openai-compatible", "model": "m", "base_url": "https://mine.example/v1"}
    response = client.post(PATH + "/test", json=body)
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_KEY_REQUIRED")
    assert probes[0] == []


def test_a_key_that_no_longer_decrypts_counts_as_not_set_up(client, admin, probes):
    """A rotated master key must not lock the 後台 out: the admin can set a new one."""
    from_env()
    with storage.transaction() as db:
        db.scalar(
            select(ProviderProfile)
        ).encrypted_secret = '{"nonce": "AAAA", "ciphertext": "AAAA"}'
    assert client.get(PATH).json()["configured"] is False
    blank = client.post(PATH + "/test", json={"adapter": "openrouter", "model": "m"})
    assert blank.json()["detail"] == "SYSTEM_AI_KEY_REQUIRED"
    assert client.put(PATH, json=FORM).status_code == 200
    with storage.transaction() as db:
        assert ai_service.platform_binding(db, owner_id(), "socratic_tutor")["secret"] == KEY


@pytest.mark.parametrize(
    "damaged", ["[]", "null", '"abc"', "not json", '{"nonce": "AAAA", "ciphertext": "AAAA"}']
)
def test_any_damaged_key_counts_as_not_set_up_and_is_logged(client, admin, caplog, damaged):
    from_env()
    with storage.transaction() as db:
        db.scalar(select(ProviderProfile)).encrypted_secret = damaged
    caplog.set_level(logging.WARNING)
    response = client.get(PATH)
    assert (response.status_code, response.json()["configured"]) == (200, False)
    assert "系統 AI 的金鑰解不開" in caplog.text
    assert ENV_KEY not in caplog.text


def test_a_compatible_service_keeps_its_key_only_at_the_same_url(
    client, admin, probes, monkeypatch
):
    import socket

    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("93.184.216.34", 0))]
    )
    tried, _ = probes
    saved = ai_service.PlatformConfig(
        "openai-compatible", "m", "sk-compatible-0003", "https://llm.example.com/v1"
    )
    practice_startup.prepare_practice(lambda: saved)
    same = {"adapter": "openai-compatible", "model": "m2", "base_url": "https://llm.example.com/v1"}
    assert client.post(PATH + "/test", json=same).status_code == 200
    assert tried[-1].api_key == "sk-compatible-0003"
    moved = {**same, "base_url": "https://elsewhere.example.com/v1"}
    response = client.post(PATH + "/test", json=moved)
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_KEY_REQUIRED")
    assert len(tried) == 1


# ---- 模型清單（spec P40）--------------------------------------------------------------------

MODELS_PATH = PATH + "/models"


@pytest.fixture
def listed(monkeypatch):
    """What the provider lists; every request is recorded."""
    seen: list[dict] = []
    state = {"models": [], "fail": None}

    async def fake(binding):
        seen.append(binding)
        if state["fail"]:
            raise state["fail"]
        return state["models"]

    monkeypatch.setattr(ai_service, "list_models", fake)
    return seen, state


def openrouter_model(model_id, name, structured=True):
    return {"id": model_id, "name": name, "structured_outputs": structured}


def test_non_admins_cannot_list_models(client, listed):
    response = client.post(MODELS_PATH, json={"adapter": "openrouter", "api_key": KEY})
    assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")
    assert listed[0] == []


def test_listing_models_needs_the_csrf_token(client, admin, listed):
    client.headers["X-CSRF-Token"] = "wrong"
    response = client.post(MODELS_PATH, json={"adapter": "openrouter", "api_key": KEY})
    assert response.status_code == 403
    assert listed[0] == []


def test_models_are_listed_with_names_providers_and_free_marks(client, admin, listed):
    seen, state = listed
    state["models"] = [
        openrouter_model("anthropic/claude-haiku-5.5", "Anthropic: Claude Haiku 5.5"),
        openrouter_model("meta-llama/llama-4:free", "Meta: Llama 4 (free)"),
        openrouter_model("openrouter/free", "Free Models Router", structured=None),
        openrouter_model("some/no-json", "Some: No JSON", structured=False),
    ]
    response = client.post(MODELS_PATH, json={"adapter": "openrouter", "api_key": KEY})
    assert response.status_code == 200, response.text
    assert response.json() == {
        "models": [
            {
                "id": "anthropic/claude-haiku-5.5",
                "name": "Claude Haiku 5.5",
                "provider": "anthropic",
                "free": False,
            },
            {
                "id": "meta-llama/llama-4:free",
                "name": "Llama 4 (free)",
                "provider": "meta-llama",
                "free": True,
            },
            {
                "id": "openrouter/free",
                "name": "Free Models Router",
                "provider": "openrouter",
                "free": True,
            },
        ]
    }
    assert seen[0]["secret"] == KEY and seen[0]["adapter"] == "openrouter"
    assert KEY not in response.text


def test_other_services_have_no_provider_or_free_mark(client, admin, listed):
    _, state = listed
    state["models"] = [
        {"id": "claude-haiku-5-5", "name": "Claude Haiku 5.5", "structured_outputs": None}
    ]
    response = client.post(MODELS_PATH, json={"adapter": "anthropic", "api_key": "sk-ant-key-0001"})
    assert response.json() == {
        "models": [
            {"id": "claude-haiku-5-5", "name": "Claude Haiku 5.5", "provider": None, "free": False}
        ]
    }


def test_a_blank_key_lists_with_the_saved_one_only_for_the_same_service(client, admin, listed):
    seen, _ = listed
    from_env()
    assert client.post(MODELS_PATH, json={"adapter": "openrouter"}).status_code == 200
    assert seen[-1]["secret"] == ENV_KEY
    response = client.post(MODELS_PATH, json={"adapter": "anthropic"})
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_KEY_REQUIRED")
    assert len(seen) == 1


def test_a_failed_listing_is_sorted_like_a_test(client, admin, listed):
    from app.modules.ai_providers.classroom_provider import ProviderHTTPError

    _, state = listed
    state["fail"] = ProviderHTTPError(
        "PROVIDER_HTTP_401", 60, status=401, error={"code": "invalid_api_key", "message": "bad"}
    )
    response = client.post(MODELS_PATH, json={"adapter": "openai", "api_key": "sk-bad-0001"})
    assert (response.status_code, response.json()["detail"]) == (424, "SYSTEM_AI_KEY_INVALID")
    assert "sk-bad-0001" not in response.text


def test_listing_field_errors_come_first(client, admin, listed):
    response = client.post(MODELS_PATH, json={"adapter": "nope", "api_key": KEY})
    assert (response.status_code, response.json()["detail"]) == (422, "SYSTEM_AI_ADAPTER_INVALID")
    response = client.post(MODELS_PATH, json={"adapter": 17, "api_key": "sk-leak-me-0001"})
    assert response.status_code == 422 and "sk-leak-me-0001" not in response.text
    assert listed[0] == []


def test_models_that_cannot_chat_are_left_out(client, admin, listed):
    """OpenAI's list says nothing about structured output, but these can never answer (P40)."""
    _, state = listed
    ids = [
        "gpt-5-mini",
        "text-embedding-3-small",
        "whisper-1",
        "tts-1-hd",
        "dall-e-3",
        "omni-moderation-latest",
        "gpt-4o-transcribe",
        "gpt-image-1",
        "gpt-realtime",
        "davinci-002",
    ]
    state["models"] = [{"id": i, "name": i, "structured_outputs": None} for i in ids]
    response = client.post(MODELS_PATH, json={"adapter": "openai", "api_key": "sk-openai-0001"})
    assert [m["id"] for m in response.json()["models"]] == ["gpt-5-mini"]


def test_odd_ids_in_a_model_list_do_not_break_it(client, admin, listed):
    _, state = listed
    state["models"] = [{"id": 123, "name": "model", "structured_outputs": None}, {"id": None}]
    response = client.post(MODELS_PATH, json={"adapter": "openai", "api_key": "sk-openai-0001"})
    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()["models"]] == ["123"]


def test_a_model_named_like_an_embedding_is_left_out(client, admin, listed, monkeypatch):
    import socket

    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("93.184.216.34", 0))]
    )
    _, state = listed
    state["models"] = [
        {"id": "model-123", "name": "Text Embedding Small", "structured_outputs": None},
        {"id": "model-456", "name": "Chat Large", "structured_outputs": None},
    ]
    response = client.post(
        MODELS_PATH,
        json={
            "adapter": "openai-compatible",
            "api_key": "k",
            "base_url": "https://llm.example.com/v1",
        },
    )
    assert [m["id"] for m in response.json()["models"]] == ["model-456"]


def test_a_model_declared_to_take_structured_output_is_kept_whatever_its_name(
    client, admin, listed
):
    """The name guess is only for lists that say nothing about capabilities (P40)."""
    _, state = listed
    state["models"] = [
        {"id": "model-123", "name": "Embedding Assistant", "structured_outputs": True}
    ]
    response = client.post(MODELS_PATH, json={"adapter": "openrouter", "api_key": KEY})
    assert [m["id"] for m in response.json()["models"]] == ["model-123"]

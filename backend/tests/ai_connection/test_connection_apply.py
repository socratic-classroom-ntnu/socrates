"""測試與套用（需求〈設定表單〉〈只有一組連線，全部 AI 共用〉）。

測試只測不存；套用先測，成功才存，失敗時原本的連線不變。同服務同網址改原本那筆，換服務或網址
新建一筆（舊的不動）；套用後每個角色都是這個模型、備用連線清空。金鑰不出現在任何回應與 log。
"""

import logging

import httpx
import pytest
from sqlalchemy import select

from app.modules.ai_connection import service as checks
from app.modules.ai_providers import classroom_gateway as gateway
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import AccountAISettings, ProviderProfile
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import configure_ai

PATH = "/api/v2/ai-settings/connection"
KEY = "sk-or-v1-teacher-pasted-key-7K2M"
MODEL = "openai/gpt-5-mini"
FORM = {"adapter": "openrouter", "model": MODEL, "api_key": KEY}
FAILURES = (
    "AI_CONNECTION_KEY_INVALID",
    "AI_CONNECTION_QUOTA",
    "AI_CONNECTION_TIMEOUT",
    "AI_CONNECTION_UNREACHABLE",
    "AI_CONNECTION_MODEL_NOT_FOUND",
)


@pytest.fixture
def probes(monkeypatch):
    """Every connection tested, in order; set `fail` to a code to make the next test fail, or
    `during` to a function that runs while the provider is being asked."""
    tried: list[ai_service.PlatformConfig] = []
    state: dict = {"fail": None, "during": None}

    async def fake(config, owner_id, *, prefix):
        assert prefix == "AI_CONNECTION"
        tried.append(config)
        if state["during"]:
            state.pop("during")()
        if state["fail"]:
            raise DomainError(state["fail"], 424)
        return config

    monkeypatch.setattr(checks, "probe", fake)
    return tried, state


@pytest.fixture
def teacher(client):
    return user(client, "owner", account_role="teacher")["id"]


def apply(client, **form):
    return client.put(PATH, json={**FORM, **form})


def profiles(owner_id):
    with storage.transaction() as db:
        rows = db.scalars(
            select(ProviderProfile)
            .where(ProviderProfile.owner_id == owner_id)
            .order_by(ProviderProfile.created_at)
        ).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "adapter": r.adapter,
                "base_url": r.base_url,
                "model": r.default_model,
                "mode": r.credential_mode,
                "last4": r.secret_last4,
                "enabled": r.enabled,
                "encrypted": r.encrypted_secret,
            }
            for r in rows
        ]


def settings(owner_id):
    with storage.transaction() as db:
        row = db.get(AccountAISettings, owner_id)
        return None if row is None else ai_service.settings_view(row)


def stored_key(profile_id):
    with storage.transaction() as db:
        row = db.get(ProviderProfile, profile_id)
        return ai_service.profile_secret(db, row, session_token_hash=None)


def code(response):
    return response.status_code, response.json()["detail"]


# ---- 測試：只測不存 -------------------------------------------------------------------------


def test_the_test_only_tests(client, teacher, probes):
    response = client.post(PATH + "/test", json=FORM)
    assert (response.status_code, response.json()) == (200, {"ok": True})
    assert probes[0] == [ai_service.PlatformConfig("openrouter", MODEL, KEY, None)]
    assert profiles(teacher) == [] and settings(teacher) is None
    assert KEY not in response.text


@pytest.mark.parametrize("failure", FAILURES)
def test_a_failed_test_answers_with_its_kind(client, teacher, probes, failure):
    probes[1]["fail"] = failure
    assert code(client.post(PATH + "/test", json=FORM)) == (424, failure)


@pytest.mark.parametrize(
    ("form", "expected"),
    [
        ({"model": " "}, "AI_CONNECTION_MODEL_REQUIRED"),
        ({"model": "m" * 201}, "AI_CONNECTION_MODEL_INVALID"),
        ({"adapter": "ollama"}, "AI_CONNECTION_ADAPTER_INVALID"),
        ({"api_key": "k" * 600}, "AI_CONNECTION_KEY_MALFORMED"),
        ({"api_key": "sk-two words"}, "AI_CONNECTION_KEY_MALFORMED"),
        ({"base_url": "https://x.example/v1"}, "AI_CONNECTION_BASE_URL_NOT_ALLOWED"),
        ({"adapter": "openai-compatible"}, "AI_CONNECTION_BASE_URL_REQUIRED"),
        ({"api_key": None}, "AI_CONNECTION_KEY_REQUIRED"),
        ({"api_key": " ​ "}, "AI_CONNECTION_KEY_REQUIRED"),
    ],
)
def test_field_errors_are_codes_and_nothing_is_sent(client, teacher, probes, form, expected):
    for method, url in (("POST", PATH + "/test"), ("PUT", PATH)):
        response = client.request(method, url, json={**FORM, **form})
        assert code(response) == (422, expected)
        assert "k" * 600 not in response.text
    assert probes[0] == []
    assert profiles(teacher) == []


@pytest.mark.parametrize(
    "body",
    [
        {"adapter": 17, "model": "m", "api_key": "sk-leak-me-0001"},
        {"adapter": "openai", "model": "m", "api_key": {"value": "sk-leak-me-0001"}},
        {"adapter": "openai", "api_key": "sk-leak-me-0001"},
    ],
)
def test_a_malformed_body_does_not_echo_the_key(client, teacher, caplog, body):
    caplog.set_level(logging.DEBUG)
    for method, url in (("POST", PATH + "/test"), ("PUT", PATH)):
        response = client.request(method, url, json=body)
        assert response.status_code == 422
        assert "sk-leak-me-0001" not in response.text and "sk-leak-me-0001" not in caplog.text


def test_a_bad_key_from_the_real_provider_never_comes_back(client, teacher, monkeypatch, caplog):
    """No fake probe here: the real one, through the iron rules, against a provider saying 401."""
    real = httpx.AsyncClient
    body = {"error": {"code": 401, "message": "No auth credentials found"}}
    transport = httpx.MockTransport(lambda request: httpx.Response(401, json=body))
    monkeypatch.setattr(
        gateway.httpx, "AsyncClient", lambda *a, **k: real(*a, transport=transport, **k)
    )
    caplog.set_level(logging.DEBUG)
    for method, url in (("POST", PATH + "/test"), ("PUT", PATH)):
        response = client.request(method, url, json=FORM)
        assert code(response) == (424, "AI_CONNECTION_KEY_INVALID")
        assert KEY not in response.text and KEY not in caplog.text
    assert profiles(teacher) == []


def test_a_student_account_is_refused(client, probes):
    user(client, "ming", account_role="student")
    for method, url in (("POST", PATH + "/test"), ("PUT", PATH)):
        response = client.request(method, url, json=FORM)
        assert code(response) == (403, "ACCOUNT_ROLE_FORBIDDEN")
    assert probes[0] == []


def test_writing_needs_the_csrf_token(client, teacher, probes):
    del client.headers["X-CSRF-Token"]
    for method, url in (("POST", PATH + "/test"), ("PUT", PATH)):
        assert client.request(method, url, json=FORM).status_code == 403
    assert probes[0] == []


# ---- 套用：先測，成功才存 --------------------------------------------------------------------


def test_the_first_apply_saves_one_encrypted_connection_for_every_role(client, teacher, probes):
    response = apply(client)
    assert response.status_code == 200, response.text
    assert KEY not in response.text
    body = response.json()
    assert body["mode"] == "own"
    assert body["own"] == {
        "adapter": "openrouter",
        "model": MODEL,
        "base_url": None,
        "name": "OpenRouter",
        "key_last4": "7K2M",
        "enabled": True,
        "key_usable": True,
    }
    (row,) = profiles(teacher)
    assert row["mode"] == "PERSISTENT" and KEY not in row["encrypted"]
    assert stored_key(row["id"]) == KEY
    saved = settings(teacher)
    assert saved["default_profile_id"] == row["id"]
    assert saved["fallback_profile_id"] is None
    assert saved["model_matrix"] == dict.fromkeys(ai_service.ROLE_KEYS, MODEL)


def test_after_applying_every_role_and_script_assist_resolve_to_the_model(client, teacher, probes):
    apply(client)
    with storage.transaction() as db:
        for role in ai_service.ROLE_KEYS:
            (binding,) = ai_service.resolve_owner_chain(db, teacher, role)[0]
            assert binding["model"] == MODEL
            assert binding["secret"] == KEY
    # 個人題庫的 AI 協助出題 reads this role's model and refuses without one.
    assert settings(teacher)["model_matrix"]["ai_script_authoring"] == MODEL


@pytest.mark.parametrize("failure", FAILURES)
def test_a_failed_apply_keeps_the_system_ai(client, teacher, probes, failure):
    probes[1]["fail"] = failure
    assert code(apply(client)) == (424, failure)
    assert profiles(teacher) == [] and settings(teacher) is None
    assert client.get(PATH).json()["mode"] == "system"


@pytest.mark.parametrize("failure", FAILURES)
def test_a_failed_apply_keeps_the_teachers_connection(client, teacher, probes, failure):
    apply(client)
    before, saved = profiles(teacher), settings(teacher)
    probes[1]["fail"] = failure
    assert code(apply(client, model="anthropic/claude-haiku-5.5", api_key="sk-or-new-0000")) == (
        424,
        failure,
    )
    assert profiles(teacher) == before
    assert settings(teacher) == saved


def test_the_same_service_changes_the_same_row_and_a_blank_key_keeps_the_saved_one(
    client, teacher, probes
):
    apply(client)
    (before,) = profiles(teacher)
    response = apply(client, model="google/gemini-2.5-flash", api_key=None)
    assert response.status_code == 200, response.text
    assert probes[0][-1].api_key == KEY
    (after,) = profiles(teacher)
    assert after["id"] == before["id"]
    assert after["model"] == "google/gemini-2.5-flash" and after["last4"] == "7K2M"
    assert settings(teacher)["model_matrix"] == dict.fromkeys(
        ai_service.ROLE_KEYS, "google/gemini-2.5-flash"
    )


def test_a_new_key_for_the_same_service_replaces_the_saved_one(client, teacher, probes):
    apply(client)
    apply(client, api_key="sk-or-v1-second-key-9Q8W")
    (row,) = profiles(teacher)
    assert row["last4"] == "9Q8W" and stored_key(row["id"]) == "sk-or-v1-second-key-9Q8W"


def test_another_service_makes_a_new_row_and_leaves_the_old_one(client, teacher, probes):
    apply(client)
    (old,) = profiles(teacher)
    response = apply(client, adapter="openai", model="gpt-5-mini", api_key="sk-openai-key-AB12")
    assert response.status_code == 200, response.text
    first, second = profiles(teacher)
    assert first == old
    assert (second["adapter"], second["name"], second["last4"]) == ("openai", "OpenAI", "AB12")
    assert settings(teacher)["default_profile_id"] == second["id"]


def test_another_service_needs_its_own_key(client, teacher, probes):
    apply(client)
    response = apply(client, adapter="openai", model="gpt-5-mini", api_key=None)
    assert code(response) == (422, "AI_CONNECTION_KEY_REQUIRED")
    assert len(probes[0]) == 1


def test_another_address_needs_its_own_key(client, teacher, probes):
    form = {"adapter": "openai-compatible", "model": "m", "base_url": "https://a.example/v1"}
    assert apply(client, **form).status_code == 200
    moved = {**form, "base_url": "https://b.example/v1", "api_key": None}
    assert code(apply(client, **moved)) == (422, "AI_CONNECTION_KEY_REQUIRED")
    assert apply(client, **{**form, "api_key": None}).status_code == 200


def test_a_trailing_slash_is_the_same_address(client, teacher, probes):
    """The saved address has no trailing slash (the URL check drops it); typed with one, it is
    still the same place: same row, saved key kept."""
    form = {"adapter": "openai-compatible", "model": "m", "base_url": "https://a.example/v1/"}
    assert apply(client, **form).status_code == 200
    assert probes[0][-1].base_url == "https://a.example/v1"
    assert apply(client, **{**form, "api_key": None}).status_code == 200
    assert len(profiles(teacher)) == 1


def test_applying_replaces_the_old_pages_fallback_and_role_models(client, teacher, probes):
    old = configure_ai(client, model="old-tutor-model")
    with storage.transaction() as db:
        row = db.get(AccountAISettings, teacher)
        row.fallback_profile_id = old
        row.model_matrix = {"socratic_tutor": "old-tutor-model", "ai_student": "other-model"}
    assert apply(client, name="新的連線").status_code == 200
    saved = settings(teacher)
    assert saved["fallback_profile_id"] is None
    assert saved["model_matrix"] == dict.fromkeys(ai_service.ROLE_KEYS, MODEL)


def test_applying_after_choosing_the_system_ai_turns_the_connection_back_on(
    client, teacher, probes
):
    apply(client)
    (row,) = profiles(teacher)
    with storage.transaction() as db:
        db.get(ProviderProfile, row["id"]).enabled = False
    assert apply(client, api_key=None).json()["mode"] == "own"
    assert profiles(teacher)[0]["enabled"] is True


def test_someone_else_changing_the_connection_during_the_test_wins(client, teacher, probes):
    apply(client)

    def other_tab():
        with storage.transaction() as db:
            db.get(AccountAISettings, teacher).default_profile_id = None

    probes[1]["during"] = other_tab
    assert code(apply(client, model="other/model")) == (409, "AI_CONNECTION_CHANGED")
    assert profiles(teacher)[0]["model"] == MODEL


def test_nothing_is_logged_with_the_key(client, teacher, probes, caplog):
    caplog.set_level(logging.DEBUG)
    client.post(PATH + "/test", json=FORM)
    apply(client)
    client.get(PATH)
    assert KEY not in caplog.text


# ---- 連線名稱 ------------------------------------------------------------------------------


def test_a_blank_name_takes_the_service_name_and_a_number_when_taken(client, teacher, probes):
    configure_ai(client)  # the old page's "OpenRouter", now the teacher's default
    with storage.transaction() as db:
        db.get(AccountAISettings, teacher).default_profile_id = None
    assert apply(client, name=" ").json()["own"]["name"] == "OpenRouter 2"


def test_a_compatible_service_is_named_after_its_host(client, teacher, probes):
    form = {"adapter": "openai-compatible", "model": "m", "base_url": "https://llm.school.edu/v1"}
    assert apply(client, **form).json()["own"]["name"] == "llm.school.edu"


def test_a_name_the_teacher_chose_that_is_taken_is_refused_before_testing(client, teacher, probes):
    configure_ai(client)
    with storage.transaction() as db:
        db.get(AccountAISettings, teacher).default_profile_id = None
    assert code(apply(client, name="OpenRouter")) == (409, "AI_CONNECTION_NAME_TAKEN")
    assert probes[0] == []


def test_keeping_its_own_name_is_not_a_clash(client, teacher, probes):
    apply(client, name="學校的金鑰")
    response = apply(client, name="學校的金鑰", model="other/model", api_key=None)
    assert response.status_code == 200, response.text
    assert [row["name"] for row in profiles(teacher)] == ["學校的金鑰"]


def test_a_name_too_long_is_refused(client, teacher, probes):
    assert code(apply(client, name="名" * 101)) == (422, "AI_CONNECTION_NAME_INVALID")
    assert probes[0] == []


def test_only_the_teachers_own_names_count(client, probes):
    user(client, "colleague", account_role="teacher")
    configure_ai(client)
    owner = user(client, "owner", account_role="teacher")["id"]
    assert apply(client).json()["own"]["name"] == "OpenRouter"
    assert len(profiles(owner)) == 1

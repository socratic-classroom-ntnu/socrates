"""PUT /ai-settings/connection/mode：切換「系統提供／自己的金鑰」（需求〈系統提供和自己的金鑰〉）。

系統提供＝停用自己的連線、金鑰保留、備用連線清掉；切回自己的金鑰不用重填、不重新測試。
"""

import pytest

from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import AccountAISettings, ProviderProfile
from app.modules.platform import storage
from tests.ai_connection.test_connection_apply import FORM, apply, code, profiles, settings
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import configure_ai
from tests.solo_activity.test_tutor_chain import bindings, fallback, system_ai

PATH = "/api/v2/ai-settings/connection/mode"


@pytest.fixture
def teacher(client):
    return user(client, "owner", account_role="teacher")["id"]


def switch(client, mode):
    return client.put(PATH, json={"mode": mode})


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def add_fallback(owner_id, name="備用"):
    """The old page's second connection, as the teacher's fallback."""
    with storage.transaction() as db:
        row = ProviderProfile(
            owner_id=owner_id,
            name=name,
            adapter="openrouter",
            default_model="fallback-model",
            credential_mode="PERSISTENT",
        )
        db.add(row)
        db.flush()
        encrypted, version = ai_service._seal(
            "sk-or-fallback", profile_id=row.id, owner_id=owner_id
        )
        row.encrypted_secret, row.key_version, row.secret_last4 = encrypted, version, "back"
        db.get(AccountAISettings, owner_id).fallback_profile_id = row.id
        return row.id


# ---- 選系統提供 ------------------------------------------------------------------------------


def test_choosing_the_system_ai_disables_the_connection_and_keeps_its_key(client, teacher):
    profile_id = configure_ai(client)
    system_ai()
    fallback()
    (before,) = profiles(teacher)
    body = ok(switch(client, "system"))
    assert body["mode"] == "system"
    assert body["own"]["enabled"] is False
    assert body["own"]["key_last4"] == before["last4"]
    (after,) = profiles(teacher)
    assert after["enabled"] is False
    assert (after["encrypted"], after["last4"]) == (before["encrypted"], before["last4"])
    assert settings(teacher)["default_profile_id"] == profile_id


def test_choosing_the_system_ai_clears_the_fallback(client, teacher):
    configure_ai(client)
    fallback_id = add_fallback(teacher)
    system_ai()
    fallback()
    ok(switch(client, "system"))
    assert settings(teacher)["fallback_profile_id"] is None
    # The old connection itself is left alone.
    assert fallback_id in [row["id"] for row in profiles(teacher)]


def test_a_fallback_only_connection_is_the_one_kept(client, teacher):
    configure_ai(client)
    fallback_id = add_fallback(teacher)
    with storage.transaction() as db:
        db.get(AccountAISettings, teacher).default_profile_id = None
    system_ai()
    fallback()
    body = ok(switch(client, "system"))
    assert body["own"]["name"] == "備用"
    assert body["own"]["enabled"] is False
    assert settings(teacher)["default_profile_id"] == fallback_id
    assert settings(teacher)["fallback_profile_id"] is None


def test_choosing_the_system_ai_without_a_connection_changes_nothing(client, teacher):
    system_ai()
    fallback()
    assert ok(switch(client, "system")) == {
        "mode": "system",
        "system": {"available": True, "model": "system-model"},
        "own": None,
    }
    assert profiles(teacher) == []


def test_the_role_models_stay_for_switching_back(client, teacher):
    configure_ai(client, model="tutor-model")
    system_ai()
    fallback()
    matrix = settings(teacher)["model_matrix"]
    ok(switch(client, "system"))
    assert settings(teacher)["model_matrix"] == matrix


@pytest.mark.parametrize("set_up", ["switch_off", "not_set_up", "disabled"])
def test_the_system_ai_unavailable_is_refused(client, teacher, set_up):
    configure_ai(client)
    if set_up == "switch_off":
        system_ai()
    elif set_up == "not_set_up":
        fallback()
    else:
        system_ai(enabled=False)
        fallback()
    before = profiles(teacher)
    assert code(switch(client, "system")) == (409, "AI_CONNECTION_SYSTEM_UNAVAILABLE")
    assert profiles(teacher) == before


# ---- 切回自己的金鑰 --------------------------------------------------------------------------


def test_switching_back_needs_no_key_and_no_test(client, teacher, probes):
    configure_ai(client)
    system_ai()
    fallback()
    (before,) = profiles(teacher)
    ok(switch(client, "system"))
    body = ok(switch(client, "own"))
    assert body["mode"] == "own"
    assert body["own"]["enabled"] is True
    (after,) = profiles(teacher)
    assert after["enabled"] is True
    assert after["encrypted"] == before["encrypted"]
    assert probes[0] == []


def test_switching_back_works_with_the_system_ai_unavailable(client, teacher):
    profile_id = configure_ai(client)
    with storage.transaction() as db:
        db.get(ProviderProfile, profile_id).enabled = False
    assert ok(switch(client, "own"))["mode"] == "own"


def test_switching_back_without_a_kept_key_is_refused(client, teacher):
    system_ai()
    fallback()
    assert code(switch(client, "own")) == (409, "AI_CONNECTION_NO_KEPT_KEY")
    assert profiles(teacher) == []


def test_switching_back_to_a_key_that_no_longer_works_is_refused(client, teacher):
    profile_id = configure_ai(client)
    with storage.transaction() as db:
        row = db.get(ProviderProfile, profile_id)
        row.enabled = False
        row.encrypted_secret = "no-longer-decrypts"
    assert code(switch(client, "own")) == (409, "AI_CONNECTION_NO_KEPT_KEY")
    assert profiles(teacher)[0]["enabled"] is False


# ---- 學生對話實際用哪個（tutor_chain） -------------------------------------------------------


def test_a_students_dialogue_follows_the_switch(client, teacher):
    configure_ai(client)
    system_id = system_ai()
    fallback()
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == teacher

    ok(switch(client, "system"))
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == system_id
    assert binding["model"] == "system-model"

    ok(switch(client, "own"))
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == teacher


def test_the_old_fallback_is_not_used_after_choosing_the_system_ai(client, teacher):
    configure_ai(client)
    add_fallback(teacher)
    system_id = system_ai()
    fallback()
    ok(switch(client, "system"))
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == system_id


def test_the_switch_turned_off_later_does_not_bring_the_key_back(client, teacher):
    configure_ai(client)
    system_ai()
    fallback()
    ok(switch(client, "system"))
    fallback(on=False)
    assert bindings(teacher) == []
    assert ok(client.get("/api/v2/ai-settings/connection"))["mode"] == "system"


# ---- 同時操作、權限、格式 --------------------------------------------------------------------


def test_a_switch_during_an_apply_test_makes_the_apply_refused(client, teacher, probes):
    system_ai()
    fallback()
    apply(client)

    def other_tab():
        with storage.transaction() as db:
            ai_service.switch_owner_connection(db, teacher, enabled=False)

    probes[1]["during"] = other_tab
    assert code(apply(client, model="other/model")) == (409, "AI_CONNECTION_CHANGED")
    assert profiles(teacher)[0]["enabled"] is False


def test_a_student_account_is_refused(client):
    user(client, "ming", account_role="student")
    assert code(switch(client, "own")) == (403, "ACCOUNT_ROLE_FORBIDDEN")


def test_switching_needs_the_csrf_token(client, teacher):
    configure_ai(client)
    del client.headers["X-CSRF-Token"]
    assert switch(client, "own").status_code == 403


@pytest.mark.parametrize("body", [{}, {"mode": "both"}, {"mode": FORM["api_key"]}])
def test_an_unknown_mode_is_refused_without_echoing_it(client, teacher, body):
    response = client.put(PATH, json=body)
    assert response.status_code == 422
    assert FORM["api_key"] not in response.text

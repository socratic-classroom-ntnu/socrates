"""帳號裡有舊頁面留下的資料時，新頁面怎麼認（需求〈帳號裡有舊頁面留下的資料時〉）。

只有備用連線、角色模型跟連線預設模型不同、舊的「只存在這次登入」金鑰已失效、金鑰解不開。
"""

import logging
import time

import pytest

from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import (
    AccountAISettings,
    ProviderProfile,
    SessionProviderSecret,
)
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from tests.ai_connection.test_connection_apply import KEY, apply, code, profiles, settings
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import configure_ai
from tests.solo_activity.test_tutor_chain import bindings, fallback, system_ai

PATH = "/api/v2/ai-settings/connection"
OLD_KEY = "sk-or-test"  # what configure_ai saves


@pytest.fixture
def teacher(client):
    return user(client, "owner", account_role="teacher")["id"]


def view(client):
    response = client.get(PATH)
    assert response.status_code == 200, response.text
    return response.json()


def old_profile(client, name, *, mode="PERSISTENT", model="profile-default"):
    """A connection made on the old page (/provider-profiles)."""
    response = client.post(
        "/api/v2/provider-profiles",
        json={
            "name": name,
            "adapter": "openrouter",
            "default_model": model,
            "credential": OLD_KEY,
            "credential_mode": mode,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def old_settings(client, **values):
    """The old page's account settings (default, fallback, role models)."""
    body = {"default_profile_id": None, "fallback_profile_id": None, "model_matrix": {}, **values}
    response = client.put("/api/v2/ai-settings/account", json=body)
    assert response.status_code == 200, response.text


def break_key(profile_id):
    """A key sealed for another row: it no longer decrypts (as after a key rotation gone wrong)."""
    with storage.transaction() as db:
        row = db.get(ProviderProfile, profile_id)
        other = db.get(ProviderProfile, configure_other(db, row.owner_id))
        row.encrypted_secret = other.encrypted_secret


def configure_other(db, owner_id):
    row = ProviderProfile(
        owner_id=owner_id,
        name="別的",
        adapter="openrouter",
        default_model="m",
        credential_mode="PERSISTENT",
    )
    db.add(row)
    db.flush()
    row.encrypted_secret, row.key_version = ai_service._seal(
        "sk-or-other", profile_id=row.id, owner_id=owner_id
    )
    return row.id


def expire_session_keys(profile_id):
    with storage.transaction() as db:
        for row in db.query(SessionProviderSecret).filter_by(profile_id=profile_id):
            row.expires_at = time.time() - 1


# ---- 只有備用連線 --------------------------------------------------------------------------


def test_a_fallback_only_connection_is_the_one_in_use(client, teacher):
    profile_id = old_profile(client, "備用", model="fallback-default")
    old_settings(client, fallback_profile_id=profile_id)
    system_ai()
    fallback()
    body = view(client)
    assert body["mode"] == "own"
    assert body["own"]["name"] == "備用"
    assert body["own"]["model"] == "fallback-default"
    # And that is what a student's dialogue uses.
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == teacher


def test_applying_over_a_fallback_only_connection_keeps_its_key_and_row(client, teacher, probes):
    profile_id = old_profile(client, "備用")
    old_settings(client, fallback_profile_id=profile_id)
    response = apply(client, api_key=None)
    assert response.status_code == 200, response.text
    tried, _ = probes
    assert tried[0].api_key == OLD_KEY
    assert [row["id"] for row in profiles(teacher)] == [profile_id]
    assert settings(teacher)["default_profile_id"] == profile_id
    assert settings(teacher)["fallback_profile_id"] is None


def test_another_teachers_row_as_the_default_is_never_theirs(client):
    user(client, "colleague", account_role="teacher")
    colleagues = configure_ai(client)
    teacher_id = user(client, "owner", account_role="teacher")["id"]
    profile_id = old_profile(client, "備用")
    old_settings(client, fallback_profile_id=profile_id)
    with storage.transaction() as db:
        db.get(AccountAISettings, teacher_id).default_profile_id = colleagues
    assert view(client)["own"]["name"] == "備用"


# ---- 角色模型跟連線的預設模型不同 ----------------------------------------------------------


def test_the_tutors_model_is_shown_not_the_profiles_default(client, teacher):
    configure_ai(client, model="tutor-model")  # profile default: profile-default
    assert view(client)["own"]["model"] == "tutor-model"


def test_without_a_tutor_model_the_profiles_default_is_shown(client, teacher):
    profile_id = old_profile(client, "OpenRouter")
    old_settings(
        client, default_profile_id=profile_id, model_matrix={"ai_script_authoring": "author-m"}
    )
    assert view(client)["own"]["model"] == "profile-default"


def test_a_blank_key_test_uses_the_saved_key_with_the_new_model(client, teacher, probes):
    configure_ai(client, model="tutor-model")
    response = client.post(PATH + "/test", json={"adapter": "openrouter", "model": "new/model"})
    assert response.status_code == 200, response.text
    tried, _ = probes
    assert (tried[0].api_key, tried[0].model) == (OLD_KEY, "new/model")


# ---- 舊的「只存在這次登入」金鑰 -------------------------------------------------------------


def session_connection(client):
    profile_id = old_profile(client, "OpenRouter", mode="SESSION")
    old_settings(client, default_profile_id=profile_id)
    return profile_id


def test_a_session_key_still_valid_is_usable(client, teacher):
    session_connection(client)
    own = view(client)["own"]
    assert own["key_usable"] is True
    assert own["key_last4"] == OLD_KEY[-4:]


def test_an_expired_session_key_shows_as_no_longer_usable(client, teacher):
    profile_id = session_connection(client)
    expire_session_keys(profile_id)
    body = view(client)
    assert body["mode"] == "own"
    assert body["own"]["key_usable"] is False


def test_an_expired_session_key_hands_a_students_dialogue_to_the_system_ai(client, teacher):
    profile_id = session_connection(client)
    expire_session_keys(profile_id)
    system_id = system_ai()
    fallback()
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == system_id


def test_an_expired_session_key_cannot_be_kept_by_a_blank_key(client, teacher, probes):
    profile_id = session_connection(client)
    expire_session_keys(profile_id)
    assert code(apply(client, api_key=None)) == (422, "AI_CONNECTION_KEY_REQUIRED")
    assert probes[0] == []


def test_an_expired_session_key_cannot_be_switched_back_to(client, teacher):
    profile_id = session_connection(client)
    expire_session_keys(profile_id)
    with storage.transaction() as db:
        db.get(ProviderProfile, profile_id).enabled = False
    assert code(client.put(PATH + "/mode", json={"mode": "own"})) == (
        409,
        "AI_CONNECTION_NO_KEPT_KEY",
    )


def test_a_new_key_replaces_a_session_key_with_an_encrypted_one(client, teacher, probes):
    profile_id = session_connection(client)
    expire_session_keys(profile_id)
    body = apply(client).json()
    assert body["own"]["key_usable"] is True
    (row,) = profiles(teacher)
    assert (row["id"], row["mode"], row["last4"]) == (profile_id, "PERSISTENT", KEY[-4:])
    assert row["encrypted"] and KEY not in row["encrypted"]


# ---- 金鑰解不開 ----------------------------------------------------------------------------


def test_a_key_that_no_longer_decrypts_shows_as_no_longer_usable(client, teacher, caplog):
    profile_id = configure_ai(client)
    break_key(profile_id)
    caplog.set_level(logging.WARNING)
    own = view(client)["own"]
    assert own["key_usable"] is False
    assert own["key_last4"] == OLD_KEY[-4:]
    # The row is named in the log, never a key.
    assert profile_id in caplog.text
    assert OLD_KEY not in caplog.text and "sk-or-other" not in caplog.text


def test_a_key_that_no_longer_decrypts_stays_an_error_for_students(client, teacher):
    """Not handed to the 系統 AI (tutor_chain, 後台 spec P36): the teacher must see it."""
    profile_id = configure_ai(client)
    break_key(profile_id)
    system_ai()
    fallback()
    with pytest.raises(DomainError) as error:
        bindings(teacher)
    assert error.value.code == "PROVIDER_CREDENTIAL_DECRYPTION"


def test_a_key_that_no_longer_decrypts_needs_a_new_one(client, teacher, probes):
    profile_id = configure_ai(client)
    break_key(profile_id)
    assert code(apply(client, api_key=None)) == (422, "AI_CONNECTION_KEY_REQUIRED")
    body = apply(client).json()
    assert body["own"]["key_usable"] is True
    assert profile_id in [row["id"] for row in profiles(teacher)]


# ---- 主要連線學生用不到、備用連線用得到：顯示學生實際用的那筆 -------------------------------


def test_a_disabled_default_shows_the_fallback_students_use(client, teacher):
    default_id = old_profile(client, "主要")
    fallback_id = old_profile(client, "備用", model="fallback-default")
    old_settings(client, default_profile_id=default_id, fallback_profile_id=fallback_id)
    with storage.transaction() as db:
        db.get(ProviderProfile, default_id).enabled = False
    body = view(client)
    assert (body["mode"], body["own"]["name"]) == ("own", "備用")
    (binding,) = bindings(teacher)
    assert binding["profile_id"] == fallback_id


def test_an_expired_default_key_shows_the_fallback_students_use(client, teacher):
    default_id = old_profile(client, "主要", mode="SESSION")
    fallback_id = old_profile(client, "備用")
    old_settings(client, default_profile_id=default_id, fallback_profile_id=fallback_id)
    expire_session_keys(default_id)
    assert view(client)["own"]["name"] == "備用"
    (binding,) = bindings(teacher)
    assert binding["profile_id"] == fallback_id


def test_choosing_the_system_ai_then_stops_the_fallback(client, teacher):
    default_id = old_profile(client, "主要")
    fallback_id = old_profile(client, "備用")
    old_settings(client, default_profile_id=default_id, fallback_profile_id=fallback_id)
    with storage.transaction() as db:
        db.get(ProviderProfile, default_id).enabled = False
    system_id = system_ai()
    fallback()
    assert client.put(PATH + "/mode", json={"mode": "system"}).status_code == 200
    (binding,) = bindings(teacher)
    assert binding["owner_id"] == system_id

"""GET /ai-settings/connection：老師看到的目前狀態（需求〈系統提供和自己的金鑰〉）。

用哪一種（系統提供／自己的金鑰）、系統提供能不能用與它的模型、自己的那一組連線。
"""

from app.modules.ai_providers.repositories import ProviderProfile
from app.modules.platform import storage
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import configure_ai
from tests.solo_activity.test_tutor_chain import SYSTEM_MODEL, fallback, system_ai

PATH = "/api/v2/ai-settings/connection"
TEACHER_KEY = "sk-or-test"  # what configure_ai saves


def view(client):
    response = client.get(PATH)
    assert response.status_code == 200, response.text
    return response.json()


def set_enabled(profile_id, enabled):
    with storage.transaction() as db:
        db.get(ProviderProfile, profile_id).enabled = enabled


def test_never_set_with_the_switch_on_uses_the_system_ai(client):
    user(client, "owner", account_role="teacher")
    system_ai()
    fallback()
    assert view(client) == {
        "mode": "system",
        "system": {"available": True, "model": SYSTEM_MODEL},
        "own": None,
    }


def test_the_switch_off_makes_the_system_ai_unavailable(client):
    user(client, "owner", account_role="teacher")
    system_ai()
    body = view(client)
    assert body["mode"] == "system"
    assert body["system"] == {"available": False, "model": SYSTEM_MODEL}
    assert body["own"] is None


def test_a_system_ai_that_is_not_set_up_counts_as_unavailable(client):
    user(client, "owner", account_role="teacher")
    fallback()
    assert view(client)["system"] == {"available": False, "model": None}


def test_a_disabled_system_ai_counts_as_unavailable(client):
    user(client, "owner", account_role="teacher")
    system_ai(enabled=False)
    fallback()
    assert view(client)["system"] == {"available": False, "model": None}


def test_the_teachers_own_key_in_use(client):
    user(client, "owner", account_role="teacher")
    configure_ai(client, model="tutor-model")
    system_ai()
    fallback()
    response = client.get(PATH)
    body = response.json()
    assert body["mode"] == "own"
    assert body["own"] == {
        "adapter": "openrouter",
        # The tutor's model is what a student's dialogue actually uses.
        "model": "tutor-model",
        "base_url": None,
        "name": "OpenRouter",
        "key_last4": TEACHER_KEY[-4:],
        "enabled": True,
        "key_usable": True,
    }
    assert TEACHER_KEY not in response.text


def test_the_system_ai_chosen_keeps_the_teachers_key(client):
    user(client, "owner", account_role="teacher")
    profile_id = configure_ai(client)
    system_ai()
    fallback()
    set_enabled(profile_id, False)
    body = view(client)
    assert body["mode"] == "system"
    assert body["own"]["enabled"] is False
    assert body["own"]["key_last4"] == TEACHER_KEY[-4:]


def test_a_student_account_is_refused(client):
    user(client, "ming", account_role="student")
    response = client.get(PATH)
    assert (response.status_code, response.json()) == (403, {"detail": "ACCOUNT_ROLE_FORBIDDEN"})


def test_signing_in_is_required(client):
    assert client.get(PATH).status_code == 401


def test_another_teachers_connection_is_not_shown(client):
    user(client, "owner", account_role="teacher")
    configure_ai(client)
    user(client, "colleague", account_role="teacher")
    assert view(client)["own"] is None

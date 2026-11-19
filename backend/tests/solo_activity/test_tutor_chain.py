"""老師沒設金鑰時改用系統 AI（後台 spec P36）：學生單人作答、延伸、總結與老師的雷達。

接手條件：開關開、系統 AI 可用、老師的 default／fallback 解析後沒有任何可用連線。
老師的金鑰呼叫失敗不接手；分組課不接手。
"""

import time
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import AccountAISettings, ProviderProfile
from app.modules.course_management import service as course_service
from app.modules.platform import storage, toggles
from app.modules.solo_activity import tutor_chain
from tests.course_management.conftest import user
from tests.solo_activity.test_solo_attempts_api import (
    OPENING,
    answer,
    configure_ai,
    ok,
    setup,
    start,
)

ROLE = "socratic_tutor"
SYSTEM_MODEL = "system-model"


def system_ai(enabled=True):
    with storage.transaction() as db:
        owner = course_service.practice_owner(db)
        config = ai_service.PlatformConfig("openrouter", SYSTEM_MODEL, "sk-or-system-0001", None)
        ai_service.save_platform_profile(db, owner.id, config, "admin-1")
        # Leftovers in the system account's own routing must not choose the model either.
        settings = db.get(AccountAISettings, owner.id)
        settings.model_matrix = {ROLE: "system-matrix-model"}
        db.scalar(
            select(ProviderProfile).where(ProviderProfile.owner_id == owner.id)
        ).enabled = enabled
        return owner.id


def fallback(on=True):
    with storage.transaction() as db:
        toggles.set_toggle(db, "system_ai_fallback", on, "admin-1", time.time())


def bindings(teacher_id):
    with storage.transaction() as db:
        return tutor_chain.course_bindings(db, SimpleNamespace(owner_id=teacher_id), ROLE)


def teacher(client, name="owner", ai=False):
    account = user(client, name, account_role="teacher")
    if ai:
        configure_ai(client)
    return account["id"]


# ---- 接手規則 --------------------------------------------------------------------------------


def test_a_teacher_with_a_connection_keeps_it(client):
    teacher_id = teacher(client, ai=True)
    system_ai()
    fallback()
    (binding,) = bindings(teacher_id)
    assert binding["owner_id"] == teacher_id


def test_the_switch_off_means_no_fallback(client):
    teacher_id = teacher(client)
    system_ai()
    assert bindings(teacher_id) == []


def test_the_switch_on_hands_over_to_the_system_ai_with_its_own_model(client):
    teacher_id = teacher(client)
    # The teacher's model_matrix names another model; it must not pick the system AI's model.
    with storage.transaction() as db:
        db.add(AccountAISettings(owner_id=teacher_id, model_matrix={ROLE: "teacher-model"}))
    owner_id = system_ai()
    fallback()
    (binding,) = bindings(teacher_id)
    assert (binding["owner_id"], binding["model"], binding["role"]) == (
        owner_id,
        SYSTEM_MODEL,
        ROLE,
    )
    # Who saved the system AI stays in the back office, not in every call's audit.
    assert "updated_by_account_id" not in binding["metadata"]


def test_no_usable_system_ai_means_no_fallback(client):
    teacher_id = teacher(client)
    fallback()
    assert bindings(teacher_id) == []
    system_ai(enabled=False)
    assert bindings(teacher_id) == []


def test_a_disabled_teacher_connection_counts_as_none(client):
    teacher_id = teacher(client, ai=True)
    with storage.transaction() as db:
        db.scalar(
            select(ProviderProfile).where(ProviderProfile.owner_id == teacher_id)
        ).enabled = False
    owner_id = system_ai()
    fallback()
    (binding,) = bindings(teacher_id)
    assert binding["owner_id"] == owner_id


def test_an_expired_session_key_counts_as_none(client):
    """A key kept only for the teacher's login session is gone once that session ends."""
    teacher_id = teacher(client, ai=True)
    with storage.transaction() as db:
        profile = db.scalar(select(ProviderProfile).where(ProviderProfile.owner_id == teacher_id))
        profile.credential_mode, profile.encrypted_secret = "SESSION", None
    owner_id = system_ai()
    fallback()
    (binding,) = bindings(teacher_id)
    assert binding["owner_id"] == owner_id


def test_with_the_switch_off_the_system_account_is_not_touched(client, monkeypatch):
    teacher_id = teacher(client)

    def untouched(db):
        raise AssertionError("the system account must not be looked up")

    monkeypatch.setattr(tutor_chain.course_service, "practice_owner", untouched)
    assert bindings(teacher_id) == []


def test_a_practice_course_already_routes_to_the_system_ai(client):
    """我的對話's private course belongs to the system account: the switch plays no part."""
    owner_id = system_ai()
    (binding,) = bindings(owner_id)
    assert binding["owner_id"] == owner_id


# ---- 呼叫點 ----------------------------------------------------------------------------------


def test_a_students_answer_uses_the_system_ai(client, tutor):
    calls, replies = tutor
    s = setup(client, ai=False)
    owner_id = system_ai()
    fallback()
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    view = answer(client, attempt["id"])
    (call,) = calls
    assert (call["binding"]["owner_id"], call["binding"]["model"]) == (owner_id, SYSTEM_MODEL)
    assert view["notice"] is None


def test_without_the_switch_the_answer_still_reports_the_missing_provider(client, tutor):
    calls, _ = tutor
    s = setup(client, ai=False)
    system_ai()
    attempt = ok(start(client, s["activity_id"]))
    view = answer(client, attempt["id"])
    assert calls == [] and view["notice"] == "owner_provider_missing"


def test_a_failing_teacher_key_is_not_replaced(client, tutor):
    calls, replies = tutor
    s = setup(client)
    system_ai()
    fallback()
    attempt = ok(start(client, s["activity_id"]))
    replies.append(RuntimeError("teacher key refused"))
    view = answer(client, attempt["id"])
    assert [c["binding"]["owner_id"] for c in calls] == [s["teacher"]["id"]]
    assert view["notice"] == "tutor_unavailable"


def test_the_radar_uses_the_system_ai(client, tutor, monkeypatch):
    from tests.solo_activity.test_solo_radar_api import DIMENSIONS, class_of, get_radar, scores

    calls, replies = tutor
    s, _ = class_of(client, 1)
    monkeypatch.setattr(tutor_chain, "resolve_owner_chain", lambda *a, **k: ([], None))
    owner_id = system_ai()
    fallback()
    replies.extend([DIMENSIONS, scores()])
    view = ok(get_radar(client, s))
    assert len(view["students"]) == 1
    assert {c["binding"]["owner_id"] for c in calls} == {owner_id}


def test_group_classes_never_hand_over(client):
    teacher_id = teacher(client)
    system_ai()
    fallback()
    with storage.transaction() as db:
        chain, _ = ai_service.resolve_provider_chain(db, teacher_id, {}, "focused_tutor", {})
    assert chain == []


@pytest.mark.parametrize("module", ["service", "radar"])
def test_every_solo_call_site_goes_through_the_chain(module):
    """No call site resolves the teacher's chain on its own (spec 語意掃描 P36)."""
    import importlib

    source = importlib.import_module(f"app.modules.solo_activity.{module}").__file__
    text = open(source, encoding="utf-8").read()
    assert "resolve_owner_chain(" not in text
    assert "course_bindings(" in text


def test_writing_the_next_scenario_uses_the_system_ai(client, tutor, monkeypatch):
    from tests.solo_activity.test_solo_attempts_api import MET, NOT_MET, confirm, do
    from tests.solo_activity.test_solo_extension import EXTENSION

    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"])
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    assert view["state"] == "confirming"
    # The teacher's connection is gone before the student confirms.
    monkeypatch.setattr(tutor_chain, "resolve_owner_chain", lambda *a, **k: ([], None))
    owner_id = system_ai()
    fallback()
    replies.append(EXTENSION)
    confirm(client, attempt["id"], view)
    assert calls[-1]["binding"]["owner_id"] == owner_id


def test_the_final_summary_uses_the_system_ai(client, tutor, monkeypatch):
    from tests.solo_activity.test_solo_attempts_api import do
    from tests.solo_activity.test_solo_extension import to_confirmed_view
    from tests.solo_activity.test_solo_final_confirmation import FINAL, NO_SCENARIO

    calls, replies = tutor
    _, attempt_id, _ = to_confirmed_view(client, replies, [NO_SCENARIO, RuntimeError("down")])
    monkeypatch.setattr(tutor_chain, "resolve_owner_chain", lambda *a, **k: ([], None))
    owner_id = system_ai()
    fallback()
    replies.append(FINAL)
    view = ok(do(client, attempt_id, "retry_reflection_prompt"))
    assert view["notice"] != "owner_provider_missing"
    assert calls[-1]["binding"]["owner_id"] == owner_id


def test_a_damaged_system_key_leaves_a_practice_course_without_a_tutor(client):
    """後台 spec P30: a key that no longer decrypts counts as no connection, also for a 我的對話
    that is already under way (it reports the missing provider instead of a decryption error)."""
    owner_id = system_ai()
    with storage.transaction() as db:
        row = db.scalar(select(ProviderProfile).where(ProviderProfile.owner_id == owner_id))
        row.encrypted_secret = '{"nonce": "AAAA", "ciphertext": "AAAA"}'
    assert bindings(owner_id) == []


def test_a_teachers_own_damaged_key_still_raises(client):
    """P36: only the system AI's broken key is forgiven; a teacher's stays an error to fix."""
    from app.modules.platform.errors import DomainError

    teacher_id = teacher(client, ai=True)
    with storage.transaction() as db:
        row = db.scalar(select(ProviderProfile).where(ProviderProfile.owner_id == teacher_id))
        row.encrypted_secret = '{"nonce": "AAAA", "ciphertext": "AAAA"}'
    with pytest.raises(DomainError):
        bindings(teacher_id)

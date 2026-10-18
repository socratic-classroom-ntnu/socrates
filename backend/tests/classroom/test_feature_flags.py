from uuid import UUID, uuid5

import pytest

from app.modules.group_dialogue.api.routes.ai_students import (
    AddAIStudents,
    ClearAIStudents,
    add_ai_students,
    ai_student_ids,
    clear_ai_students,
)
from app.modules.group_dialogue.services.feature_flags import feature_enabled, feature_state
from app.modules.classroom_core.orchestrator.classroom import DomainError


def test_ai_students_default_enabled(monkeypatch):
    monkeypatch.delenv("SOCRATES_FEATURE_AI_STUDENTS", raising=False)
    assert feature_enabled("ai_students") is True
    assert feature_state("ai_students") == {"enabled": True, "reason": None}


def test_ai_students_disabled_state_has_stable_reason(monkeypatch):
    monkeypatch.setenv("SOCRATES_FEATURE_AI_STUDENTS", "false")
    assert feature_state("ai_students") == {
        "enabled": False,
        "reason": "AI_STUDENTS_DISABLED",
    }


@pytest.mark.parametrize(
    ("handler", "body"),
    [
        (add_ai_students, AddAIStudents(action_id="action-id", count=1)),
        (clear_ai_students, ClearAIStudents(action_id="action-id")),
    ],
)
def test_ai_student_routes_return_clear_code_when_disabled(monkeypatch, handler, body):
    monkeypatch.setenv("SOCRATES_FEATURE_AI_STUDENTS", "false")
    with pytest.raises(DomainError) as error:
        handler(str(UUID(int=1)), body, object())
    assert error.value.code == "AI_STUDENTS_DISABLED"
    assert error.value.status == 409


def test_new_ai_student_ids_use_product_namespace_and_leave_legacy_identity_distinct():
    room_id = str(UUID(int=1))
    first = ai_student_ids(room_id, "action-id", 0)
    assert first == ai_student_ids(room_id, "action-id", 0)
    legacy_account = str(uuid5(UUID(room_id), "r88-ai-account:action-id:0"))
    legacy_membership = str(uuid5(UUID(room_id), f"r88-ai-member:{legacy_account}"))
    assert first != (legacy_account, legacy_membership)
    assert all(UUID(value) for value in first)

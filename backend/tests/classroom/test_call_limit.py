import pytest

from app.services import llm_workers as workers
from app.api.classroom_schemas import ScriptDocument
from app.tutor.classroom_provider import ProviderWait
from app.repositories.classroom_storage import Account, Job, Room, Script, configure, transaction
from app.services.llm_workers import effective_call_limit


def test_teacher_budget_caps_the_account_limit():
    assert effective_call_limit(30, {"max_calls": 240}, "focused_tutor") == 30


def test_account_limit_caps_a_larger_teacher_budget():
    assert effective_call_limit(500, {"max_calls": 240}, "focused_tutor") == 240


def test_unset_account_limit_falls_back_to_teacher_budget():
    assert effective_call_limit(30, {"max_calls": 0}, "focused_tutor") == 30
    assert effective_call_limit(30, {}, "focused_tutor") == 30


def test_teacher_zero_disables_live_calls_for_tutor():
    assert effective_call_limit(0, {"max_calls": 240}, "focused_tutor") == 0


def test_ai_students_keep_their_floor(monkeypatch):
    monkeypatch.setenv("PORTAL_AI_CALL_BUDGET", "240")
    assert effective_call_limit(30, {"max_calls": 240}, "llm_student_turn") == 240


def test_default_teacher_budget_is_240():
    doc = ScriptDocument.model_validate(
        {
            "title": "t",
            "questions": [
                {
                    "id": "q1",
                    "title": "選擇",
                    "scenario": "s",
                    "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
                }
            ],
        }
    )
    assert doc.live_llm_call_budget == 240


@pytest.fixture
def seeded_job(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    configure("sqlite+pysqlite:///:memory:", create=True)
    with transaction() as db:
        account = Account(
            id="a" * 36,
            username="owner",
            email="o@example.test",
            password_hash="fixture",
            verified=True,
        )
        script = Script(
            id="s" * 36,
            owner_id=account.id,
            document={"title": "t", "questions": []},
            revision=1,
        )
        room = Room(
            id="r" * 36,
            creator_id=account.id,
            script_id=script.id,
            code="LIMIT01",
            state={"script": {"live_llm_call_budget": 30}, "members": {}},
            llm_used=30,
        )
        job = Job(
            id="j" * 36,
            room_id=room.id,
            logical_key="focus:f1:1",
            kind="focused_tutor",
            context={},
            priority=1,
            lease="lease-1",
        )
        db.add_all([account, script, room, job])
    monkeypatch.setattr(
        workers,
        "resolve_provider_chain",
        lambda db, room, kind, context: (
            [{"profile_id": "p"}],
            {"budgets": {"max_calls": 240, "max_tokens": 1_000_000}},
        ),
    )
    return {
        "id": "j" * 36,
        "lease": "lease-1",
        "room": "r" * 36,
        "kind": "focused_tutor",
        "context": {},
    }


def test_reserve_call_stops_at_the_teacher_budget(seeded_job):
    with pytest.raises(ProviderWait) as raised:
        workers.reserve_call(seeded_job)
    assert raised.value.reason == "CLASSROOM_BUDGET_AVAILABILITY"

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, OperationalError

import app.main as main
from app.config import settings
from app.db import SessionLocal
from app.models import Session
from app.repositories.session_repository import SessionRepository
from app.services.conversation import ConversationService
from app.tutor.gateway import TutorGateway
from app.tutor.scripted import ScriptedProvider


def test_restart_requires_explicit_choice_and_preserves_history(client, db, learner_id):
    headers = {"X-Learner-Id": learner_id}
    body = {"ladder_id": "trolley"}
    first = client.post("/api/sessions", json=body, headers=headers)
    assert first.status_code == 201
    old = first.json()
    old_id = old["session"]["id"]

    other_headers = {"X-Learner-Id": str(uuid.uuid4())}
    other_id = client.post("/api/sessions", json=body, headers=other_headers).json()["session"][
        "id"
    ]

    conflict = client.post("/api/sessions", json=body, headers=headers)
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == {"code": "active_session_exists", "session_id": old_id}
    assert (
        client.get(f"/api/sessions/{old_id}", headers=headers).json()["session"]["status"]
        == "active"
    )

    new = client.post("/api/sessions", json={**body, "restart_existing": True}, headers=headers)
    assert new.status_code == 201
    assert new.json()["session"]["id"] != old_id
    previous = client.get(f"/api/sessions/{old_id}", headers=headers).json()
    assert previous["session"]["status"] == "ended"
    assert previous["session"]["end_reason"] == "restarted"
    assert previous["messages"] == old["appended_messages"]
    active = db.scalar(
        select(func.count())
        .select_from(Session)
        .where(Session.learner_id == uuid.UUID(learner_id), Session.status == "active")
    )
    assert active == 1

    other = client.get(f"/api/sessions/{other_id}", headers=other_headers)
    assert other.status_code == 200
    assert other.json()["session"]["status"] == "active"
    assert other.json()["session"]["end_reason"] is None


def test_concurrent_start_creates_one_active_session():
    from app.services.conversation import ActiveSessionExists

    learner = uuid.uuid4()
    gate = threading.Barrier(2)

    def attempt() -> str:
        with SessionLocal() as db:
            service = ConversationService(
                db,
                main.ladder_repository,
                TutorGateway(ScriptedProvider.load(settings.script_path)),
            )
            gate.wait(timeout=5)
            try:
                service.start(learner)
                return "created"
            except ActiveSessionExists:
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(attempt) for _ in range(2)]
        assert sorted(item.result(timeout=10) for item in futures) == ["conflict", "created"]
    with SessionLocal() as db:
        active = db.scalar(
            select(func.count())
            .select_from(Session)
            .where(Session.learner_id == learner, Session.status == "active")
        )
    assert active == 1


def test_database_rejects_second_active_session_for_learner():
    learner = uuid.uuid4()
    with SessionLocal() as db:
        ConversationService(
            db, main.ladder_repository, TutorGateway(ScriptedProvider.load(settings.script_path))
        ).start(learner)
    with SessionLocal() as db:
        db.add(
            Session(
                id=uuid.uuid4(),
                learner_id=learner,
                status="active",
                flow_state="active_in_stage",
                ladder_id="trolley",
                ladder_version=1,
                current_stage_index=0,
                extra_turns_used=0,
            )
        )
        with pytest.raises(IntegrityError) as error:
            db.commit()
        assert error.value.orig.diag.constraint_name == "uq_sessions_one_active_per_learner"


def test_restart_read_waits_for_inflight_session_command():
    learner = uuid.uuid4()
    with SessionLocal() as db:
        session_id = (
            ConversationService(
                db,
                main.ladder_repository,
                TutorGateway(ScriptedProvider.load(settings.script_path)),
            )
            .start(learner)
            .session.id
        )

    with SessionLocal() as active_command_db:
        assert SessionRepository(active_command_db).get_for_update(session_id) is not None
        with SessionLocal() as restart_db:
            restart_db.execute(text("SET LOCAL lock_timeout = '200ms'"))
            with pytest.raises(OperationalError) as error:
                SessionRepository(restart_db).get_active_for_learner(learner)
            assert "lock timeout" in str(error.value.orig).lower()

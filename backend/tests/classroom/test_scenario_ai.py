"""Per-question model override (issue #16): Question.scenario_ai {provider_profile_id, model}."""

import json
import time
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.classroom_schemas import DynamicResult, ScriptDocument, public_question
from app.api.routes.provider_profiles import (
    AccountAISettings,
    ProviderProfile,
    _seal,
    resolve_provider_chain,
)
from app.classroom_app import create_app
from app.orchestrator.classroom import GameOrchestrator, scoped_job_context
from app.repositories import classroom_storage as storage
from app.services import classroom as service
from app.services.llm_workers import claim_job, reserve_call

from tests.classroom.test_groups import classroom, start  # noqa: F401
from tests.classroom.test_script_assist import DOC, login


def question(qid, scenario_ai=None):
    value = {
        "id": qid,
        "title": "題目 " + qid,
        "scenario": "抉擇",
        "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
        "max_focus_turns": 1,
    }
    if scenario_ai:
        value["scenario_ai"] = scenario_ai
    return value


# --- contract ---------------------------------------------------------------


def test_scenario_ai_is_optional_and_omitted_when_unset():
    doc = ScriptDocument.model_validate(
        {"title": "t", "questions": [question("q1"), {**question("q2"), "scenario_ai": None}]}
    ).model_dump()
    assert all("scenario_ai" not in q for q in doc["questions"])


@pytest.mark.parametrize(
    "scenario_ai",
    [
        {"provider_profile_id": "p1", "model": "   "},
        {"provider_profile_id": "p1", "model": ""},
        {"provider_profile_id": "", "model": "m"},
        {"provider_profile_id": "p1"},
        {"provider_profile_id": "p1", "model": "m", "extra": 1},
    ],
)
def test_scenario_ai_shape_is_validated(scenario_ai):
    with pytest.raises(ValidationError):
        ScriptDocument.model_validate({"title": "t", "questions": [question("q1", scenario_ai)]})


def test_generated_questions_cannot_carry_routing():
    generated = question("g1", {"provider_profile_id": "p1", "model": "m"})
    with pytest.raises(ValidationError):
        DynamicResult.model_validate({"question": generated})


def test_job_context_lifts_override_only_for_that_questions_jobs():
    q = question("q1", {"provider_profile_id": "p1", "model": "m"})
    for kind in ("focused_tutor", "personal_tutor", "question_summary"):
        scoped = scoped_job_context(kind, {"question": q, "option_id": "a"})
        assert scoped["scenario_ai"] == {"provider_profile_id": "p1", "model": "m"}
        assert "scenario_ai" not in scoped["question"]
    assert "scenario_ai" in q  # the stored question is untouched
    for kind in ("dynamic_question", "llm_student_turn"):
        other = scoped_job_context(kind, {"question": q})
        assert "scenario_ai" not in other and "scenario_ai" not in other["question"]


# --- script validator (owner scope) ------------------------------------------


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CLASSROOM_COOKIE_SECURE", "false")
    monkeypatch.setenv("SOCRATES_ALLOWED_ORIGINS", "http://testserver")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    storage.configure("sqlite://", create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


def profile(c, name="OpenRouter"):
    r = c.post(
        "/api/v2/provider-profiles",
        json={"name": name, "adapter": "openrouter", "default_model": "profile-default"},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def doc_with(scenario_ai):
    doc = deepcopy(DOC)
    doc["questions"][0]["scenario_ai"] = scenario_ai
    return doc


def test_script_save_checks_profile_owner(client):
    login(client, "other")
    foreign = profile(client)
    login(client, "teacher")
    mine = profile(client)

    ok = client.post(
        "/api/v2/scripts",
        json={"document": doc_with({"provider_profile_id": mine, "model": " my-model "})},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["document"]["questions"][0]["scenario_ai"] == {
        "provider_profile_id": mine,
        "model": "my-model",
    }

    for bad in (foreign, str(uuid4())):
        r = client.post(
            "/api/v2/scripts",
            json={"document": doc_with({"provider_profile_id": bad, "model": "m"})},
        )
        assert r.status_code == 422
        assert r.json()["detail"] == "SCENARIO_AI_PROFILE_REQUIRED"

    r = client.put(
        "/api/v2/scripts/" + ok.json()["id"],
        json={
            "document": doc_with({"provider_profile_id": foreign, "model": "m"}),
            "expected_revision": ok.json()["revision"],
        },
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "SCENARIO_AI_PROFILE_REQUIRED"

    r = client.post(
        "/api/v2/scripts",
        json={"document": doc_with({"provider_profile_id": mine, "model": ""})},
    )
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], list)

    plain = client.post("/api/v2/scripts", json={"document": DOC}).json()
    assert "scenario_ai" not in plain["document"]["questions"][0]

    # A profile a script still routes to cannot disappear underneath it.
    r = client.delete("/api/v2/provider-profiles/" + mine)
    assert r.status_code == 409
    assert r.json()["detail"] == "PROVIDER_PROFILE_IN_SCRIPT"


# --- runtime: the override routes that question's jobs ----------------------


OWNER = "00000000-0000-4000-8000-000000000016"
DEFAULT = "40000000-0000-4000-8000-000000000016"
SCENE = "50000000-0000-4000-8000-000000000016"


def _profile(pid, name, secret):
    encrypted, version = _seal(secret, profile_id=pid, owner_id=OWNER)
    return ProviderProfile(
        id=pid,
        owner_id=OWNER,
        name=name,
        adapter="openrouter",
        default_model="profile-default",
        credential_mode="PERSISTENT",
        encrypted_secret=encrypted,
        secret_last4=secret[-4:],
        key_version=version,
    )


@pytest.fixture
def room(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    monkeypatch.delenv("SOCRATES_PROVIDER_MASTER_KEY", raising=False)
    storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with storage.transaction() as db:
        teacher = storage.Account(
            id=OWNER, username="teacher", email="t@example.test", password_hash="x", verified=True
        )
        student = storage.Account(
            id=str(uuid4()), username="s1", email="s@example.test", password_hash="x", verified=True
        )
        db.add_all([teacher, student])
        db.flush()
        db.add_all(
            [_profile(DEFAULT, "Default", "default-key"), _profile(SCENE, "Scene", "scene-key")]
        )
        db.flush()
        db.add(
            AccountAISettings(
                owner_id=OWNER,
                default_profile_id=DEFAULT,
                fallback_profile_id=DEFAULT,
                model_matrix={"socratic_tutor": "matrix-tutor", "question_summary": "matrix-sum"},
                budgets={"max_calls": 100, "max_tokens": 100000, "estimated_cost_ceiling": None},
            )
        )
        document = {
            "title": "覆寫測試",
            "mode": "static",
            "questions": [
                question("q1", {"provider_profile_id": SCENE, "model": "scenario-model"}),
                question("q2"),
            ],
            "live_llm_call_budget": 50,
        }
        script = storage.Script(id=str(uuid4()), owner_id=OWNER, document=document, revision=1)
        db.add(script)
        db.flush()
        rid = service.create_room(db, teacher, script.id)["id"]
        code = db.get(storage.Room, rid).code
        service.join(db, student, SimpleNamespace(code=code, alias="同學", avatar="scholar"))
        from app.api.classroom_schemas import Command

        service.execute(db, teacher, rid, Command(action_id="start-issue16", kind="start"))
    yield rid, student.id
    storage.engine().dispose()


def _advance(rid, step):
    with storage.transaction() as db:
        r = db.get(storage.Room, rid)
        machine = GameOrchestrator(service.hydrate(db, r), time.time() + 10)
        step(machine)
        storage.persist_machine(db, r, machine)


def test_override_routes_that_questions_jobs_and_never_reaches_students(room):
    rid, student_account = room
    _advance(rid, lambda m: m.tick())  # countdown → answering on q1
    with storage.transaction() as db:
        r = db.get(storage.Room, rid)
        assert r.state["questions"][0]["scenario_ai"]["model"] == "scenario-model"
        member_id = next(iter(r.state["members"]))
        run_id = r.state["runs"][0]["id"]
        for viewer, mode in ((student_account, "student"), (OWNER, "teacher")):
            view = service.view(db, r, viewer, mode)
            assert view["question"]["id"] == "q1"
            assert "scenario_ai" not in view["question"]

    def answer_and_focus(m):
        m.command(
            "answer",
            {"question_run_id": run_id, "option_id": "a", "text": "理由", "revision": 0},
            member_id,
            False,
        )
        m.finalize()
        m.next_focus()

    _advance(rid, answer_and_focus)
    item = claim_job()
    assert item["kind"] == "focused_tutor"
    assert item["context"]["scenario_ai"]["provider_profile_id"] == SCENE
    prompt = item["messages"][1]["content"]
    assert "scenario_ai" not in prompt and SCENE not in prompt
    bindings, routing = reserve_call(item)
    assert [b["profile_id"] for b in bindings] == [SCENE, DEFAULT]
    assert bindings[0]["model"] == "scenario-model" and bindings[0]["secret"] == "scene-key"
    # The fallback profile keeps the classroom role model, not the scenario's.
    assert bindings[1]["model"] == "matrix-tutor"
    assert routing["scenario_ai"] is True

    def close_question(m):
        m.close_focus("teacher_next")
        m.finish_question()  # queues q1's summary and starts q2

    _advance(rid, close_question)
    summary = claim_job()
    assert summary["kind"] == "question_summary"
    bindings, _ = reserve_call(summary)
    assert bindings[0]["profile_id"] == SCENE and bindings[0]["model"] == "scenario-model"

    with storage.transaction() as db:
        r = db.get(storage.Room, rid)
        q2 = r.state["questions"][1]
        bindings, routing = resolve_provider_chain(
            db, r, "focused_tutor", scoped_job_context("focused_tutor", {"question": q2})
        )
        assert bindings[0]["profile_id"] == DEFAULT and bindings[0]["model"] == "matrix-tutor"
        assert routing["scenario_ai"] is False
        view = service.view(db, r, student_account)
        assert view["question"]["id"] == "q2"


def test_public_question_strips_routing():
    q = question("q1", {"provider_profile_id": "p", "model": "m"})
    assert "scenario_ai" not in public_question(q)
    assert public_question(None) is None


# --- group runs: the per-student personal stage --------------------------------


def test_personal_tutor_job_follows_the_question_override():
    from tests.classroom.test_group_personal import answer as answer_personal
    from tests.classroom.test_group_personal import room as personal_room

    override = {"provider_profile_id": "p1", "model": "m"}
    g = personal_room(scenario_ai=override)
    answer_personal(g, "m1")
    job = g.jobs[-1]
    assert job["kind"] == "personal_tutor"
    assert job["context"]["scenario_ai"] == override
    assert "scenario_ai" not in job["context"]["question"]


def test_group_run_routes_personal_tutor_and_hides_the_override(classroom):  # noqa: F811
    from starlette.requests import Request

    from app.api.routes import groups as group
    from tests.classroom.test_group_personal import answer_in_group, as_member

    rid, selected, _ = classroom
    override = {"provider_profile_id": SCENE, "model": "scenario-model"}
    with storage.transaction() as db:
        room_row = db.get(storage.Room, rid)
        script = db.get(storage.Script, room_row.script_id)
        document = deepcopy(script.document)
        document["questions"][0]["scenario_ai"] = override
        script.document = document
    result, _ = start(classroom, count=1, capacity=3)
    gid = result["groups"][0]["id"]
    with storage.transaction() as db:
        answer_in_group(db, gid, ["a", "b"])
        assert db.get(storage.Room, gid).state["questions"][0]["scenario_ai"] == override
        as_member(db, selected, gid, 0)

    personal = []
    while (item := claim_job()) is not None:
        if item["kind"] == "personal_tutor":
            personal.append(item)
    assert personal
    for item in personal:
        assert item["context"]["scenario_ai"] == override
        assert "scenario_ai" not in item["context"]["question"]
        assert SCENE not in item["messages"][1]["content"]

    student_request = Request({"type": "http", "query_string": b"mode=student", "headers": []})
    mine = group.view(gid, student_request)
    assert mine["question"]["id"] == "q1"
    assert SCENE not in json.dumps(mine, ensure_ascii=False)
    with storage.transaction() as db:
        native = service.view(db, db.get(storage.Room, gid), selected["id"])
    assert SCENE not in json.dumps(native, ensure_ascii=False, default=str)


def test_a_disabled_override_profile_falls_back_to_the_classroom_default(room):
    rid, _ = room
    with storage.transaction() as db:
        db.get(ProviderProfile, SCENE).enabled = False
        settings = db.get(AccountAISettings, OWNER)
        settings.fallback_profile_id = None
    with storage.transaction() as db:
        r = db.get(storage.Room, rid)
        q1 = r.state["questions"][0]
        bindings, routing = resolve_provider_chain(
            db, r, "personal_tutor", scoped_job_context("personal_tutor", {"question": q1})
        )
    assert [b["profile_id"] for b in bindings] == [DEFAULT]
    assert bindings[0]["model"] == "matrix-tutor"
    assert routing["scenario_ai"] is True

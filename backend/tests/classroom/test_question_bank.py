"""題庫商店（issue #17）against the native SQLite test adapter; identity is injected."""

from uuid import uuid4

import pytest
from starlette.requests import Request

from app.modules.content_authoring import service as authoring_service
from app.modules.content_authoring.routes import question_bank as bank
from app.modules.classroom_core.orchestrator import DomainError
from app.modules.platform import storage as storage
from app.modules.identity_access.repositories import Account
from app.modules.content_authoring.repositories import Script
from app.modules.content_authoring.contracts import BankMutation, ImportQuestion, Publish
from app.modules.content_authoring.service import PAGE_LIMIT
from app.modules.content_authoring.repositories import BankQuestion


def question(qid="q1", title="共同資源怎麼分？", scenario="社區菜園的收成要怎麼分配？"):
    return {
        "id": qid,
        "title": title,
        "scenario": scenario,
        "options": [{"id": "a", "text": "按出力分"}, {"id": "b", "text": "平均分"}],
        "duration_seconds": 90,
        "argument_required": True,
        "tutor_goal": "釐清原則",
        "probe_hints": ["為什麼？"],
        "max_focus_turns": 3,
        "focus_response_seconds": 90,
        "sender_point_cap": 5,
        "receiver_point_cap": 25,
    }


def document(*questions):
    return {
        "title": "倫理思辨",
        "mode": "static",
        "questions": list(questions) or [question()],
        "max_questions": 3,
        "preview_seconds": 8,
        "live_llm_call_budget": 30,
    }


@pytest.fixture
def env(monkeypatch):
    storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with storage.transaction() as db:
        people = [
            Account(
                id=str(uuid4()),
                username=f"teacher{i}",
                email=f"t{i}@fixture.invalid",
                password_hash="fixture",
                verified=True,
            )
            for i in range(2)
        ]
        db.add_all(people)
        db.flush()
        ids = [p.id for p in people]
        scripts = []
        for owner in ids:
            s = Script(id=str(uuid4()), owner_id=owner, document=document(), revision=1)
            db.add(s)
            scripts.append(s.id)
    who = {"id": ids[0]}
    monkeypatch.setattr(
        bank, "user", lambda db, request, mutation=False: db.get(Account, who["id"])
    )
    req = Request({"type": "http", "query_string": b"", "headers": []})
    yield ids, scripts, who, req
    storage.engine().dispose()


def publish(req, script_id, question_id="q1", **extra):
    return bank.publish(
        Publish(action_id=uuid4().hex, script_id=script_id, question_id=question_id, **extra),
        req,
    )


def test_publish_strips_owner_specific_fields_and_is_searchable(env):
    ids, scripts, who, req = env
    with storage.transaction() as db:
        s = db.get(Script, scripts[0])
        doc = document(dict(question(), scenario_ai={"profile_id": "p-1", "model": "secret"}))
        s.document = doc
    item = publish(req, scripts[0], tags=[" 倫理 ", "資源", "倫理"])
    assert "scenario_ai" not in item["question"]
    assert item["tags"] == ["倫理", "資源"]
    assert item["author"] == "teacher0" and item["mine"] is True
    with storage.transaction() as db:
        row = db.get(BankQuestion, item["id"])
        assert "scenario_ai" not in row.question

    who["id"] = ids[1]
    found = bank.search(req, q="菜園")
    assert found["total"] == 1 and found["items"][0]["id"] == item["id"]
    assert found["items"][0]["mine"] is False and found["items"][0]["option_count"] == 2
    assert "source_script_id" not in found["items"][0]
    assert bank.search(req, q="資源")["total"] == 1  # tag match
    assert bank.search(req, q="不存在的字")["total"] == 0
    assert bank.search(req, q="100%")["total"] == 0  # LIKE wildcards are escaped
    assert bank.detail(item["id"], req)["question"]["scenario"].startswith("社區菜園")


def test_publish_requires_script_owner_and_existing_question(env):
    ids, scripts, who, req = env
    with pytest.raises(DomainError) as exc:
        publish(req, scripts[1])
    assert exc.value.code == "SCRIPT_OWNER_REQUIRED" and exc.value.status == 403
    with pytest.raises(DomainError) as exc:
        publish(req, scripts[0], question_id="missing")
    assert exc.value.code == "BANK_SOURCE_QUESTION_REQUIRED"


def test_republishing_the_same_question_updates_one_entry(env):
    _, scripts, _, req = env
    first = publish(req, scripts[0])
    second = publish(req, scripts[0], title="新的標題")
    assert second["id"] == first["id"] and second["revision"] == 2
    assert bank.search(req)["total"] == 1


def test_action_id_replay_is_idempotent(env):
    _, scripts, _, req = env
    body = Publish(action_id=uuid4().hex, script_id=scripts[0], question_id="q1")
    assert bank.publish(body, req) == bank.publish(body, req)
    assert bank.search(req)["total"] == 1


def test_search_pagination(env):
    _, scripts, _, req = env
    with storage.transaction() as db:
        s = db.get(Script, scripts[0])
        s.document = document(*[question(f"q{i}", title=f"題目 {i}") for i in range(5)])
    for i in range(5):
        publish(req, scripts[0], question_id=f"q{i}")
    page = bank.search(req, offset=0, limit=2)
    rest = bank.search(req, offset=2, limit=10)
    assert page["total"] == 5 and len(page["items"]) == 2 and len(rest["items"]) == 3
    assert not {i["id"] for i in page["items"]} & {i["id"] for i in rest["items"]}
    assert bank.search(req, limit=1000)["limit"] == PAGE_LIMIT


def test_import_gets_fresh_id_and_bumps_revision(env):
    ids, scripts, who, req = env
    item = publish(req, scripts[0])
    who["id"] = ids[1]
    result = bank.import_question(
        item["id"], ImportQuestion(action_id=uuid4().hex, script_id=scripts[1]), req
    )
    assert result["revision"] == 2
    qids = [q["id"] for q in result["document"]["questions"]]
    assert len(qids) == 2 and len(set(qids)) == 2
    assert result["question_id"] == qids[-1] and result["question_id"] != "q1"
    with storage.transaction() as db:
        s = db.get(Script, scripts[1])
        assert s.revision == 2 and len(s.document["questions"]) == 2
        assert "scenario_ai" not in s.document["questions"][-1]
        # 匯入的題目以目前的 Question 模型驗證：沒寫的個人追問欄位補上預設值。
        imported = s.document["questions"][-1]
        assert imported["max_personal_turns"] == 6 and imported["personal_seconds"] == 600


def test_personal_stage_fields_travel_with_the_question_and_are_validated(env):
    _, scripts, _, req = env
    with storage.transaction() as db:
        s = db.get(Script, scripts[0])
        s.document = document(
            dict(question(), max_personal_turns=4, personal_seconds=300),
            dict(question("q2"), max_personal_turns=99),
        )
    item = publish(req, scripts[0])
    assert item["question"]["max_personal_turns"] == 4
    assert item["question"]["personal_seconds"] == 300
    with pytest.raises(DomainError) as exc:
        publish(req, scripts[0], question_id="q2")
    assert exc.value.code == "BANK_QUESTION_INVALID" and exc.value.status == 422


def test_import_requires_target_script_owner(env):
    ids, scripts, who, req = env
    item = publish(req, scripts[0])
    who["id"] = ids[1]
    with pytest.raises(DomainError) as exc:
        bank.import_question(
            item["id"], ImportQuestion(action_id=uuid4().hex, script_id=scripts[0]), req
        )
    assert exc.value.code == "SCRIPT_OWNER_REQUIRED"
    with pytest.raises(DomainError) as exc:
        bank.import_question(
            "missing", ImportQuestion(action_id=uuid4().hex, script_id=scripts[1]), req
        )
    assert exc.value.code == "BANK_QUESTION_REQUIRED" and exc.value.status == 404


def test_import_respects_the_script_question_limit(env, monkeypatch):
    ids, scripts, who, req = env
    item = publish(req, scripts[0])
    monkeypatch.setattr(authoring_service, "MAX_SCRIPT_QUESTIONS", 1)
    with pytest.raises(DomainError) as exc:
        bank.import_question(
            item["id"], ImportQuestion(action_id=uuid4().hex, script_id=scripts[0]), req
        )
    assert exc.value.code == "BANK_SCRIPT_QUESTION_LIMIT" and exc.value.status == 422
    with storage.transaction() as db:
        assert db.get(Script, scripts[0]).revision == 1


def test_only_the_owner_can_unpublish(env):
    ids, scripts, who, req = env
    item = publish(req, scripts[0])
    who["id"] = ids[1]
    with pytest.raises(DomainError) as exc:
        bank.unpublish(item["id"], BankMutation(action_id=uuid4().hex), req)
    assert exc.value.code == "BANK_OWNER_REQUIRED" and exc.value.status == 403
    who["id"] = ids[0]
    assert bank.unpublish(item["id"], BankMutation(action_id=uuid4().hex), req)["status"] == (
        "UNPUBLISHED"
    )
    assert bank.search(req)["total"] == 0
    with pytest.raises(DomainError) as exc:
        bank.detail(item["id"], req)
    assert exc.value.code == "BANK_QUESTION_REQUIRED"


def test_fresh_schema_has_the_bank_table(env):
    from sqlalchemy import inspect

    assert "bank_questions" in inspect(storage.engine()).get_table_names()

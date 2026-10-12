"""AI 協助設計 (issue #16): POST /api/v2/scripts/assist routes through ai_script_authoring."""

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.classroom_app import create_app
from app.repositories import classroom_storage as storage
from app.tutor import classroom_gateway
from app.tutor.classroom_provider import ProviderWait

DOC = {
    "title": "倫理",
    "mode": "static",
    "questions": [
        {
            "id": "q",
            "title": "題目",
            "scenario": "抉擇",
            "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
            "duration_seconds": 120,
            "max_focus_turns": 2,
            "scenario_ai": None,
        }
    ],
}

SUGGESTION = {
    "title": "救生艇的最後一個位置",
    "scenario": "救生艇只剩一個位置，岸邊有兩個人等待。",
    "options": ["讓年紀最小的人上船", "抽籤決定", "其他"],
    "tutor_goal": "辨認學生採用的分配原則。",
    "probe_hints": ["你最重視哪一個理由？", "條件改變時你會怎麼判斷？"],
    "rationale": "以稀缺資源分配凸顯後果與程序的取捨。",
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CLASSROOM_COOKIE_SECURE", "false")
    monkeypatch.setenv("SOCRATES_ALLOWED_ORIGINS", "http://testserver")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    monkeypatch.delenv("SOCRATES_PROVIDER_MASTER_KEY", raising=False)
    storage.configure("sqlite://", create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


def login(c, name):
    password = "Socratic-123456"
    if c.post("/api/v2/auth/login", json={"login": name, "password": password}).status_code != 200:
        body = {"username": name, "email": name + "@example.org", "password": password}
        assert c.post("/api/v2/auth/register", json=body).status_code == 200
        with storage.transaction() as db:
            mail = db.scalars(select(storage.Mail)).all()[-1]
            token = re.search(r"verify_token=(\S+)", mail.body)[1]
        assert c.post("/api/v2/auth/verify", json={"token": token}).status_code == 200
    r = c.post("/api/v2/auth/login", json={"login": name, "password": password})
    assert r.status_code == 200
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r.json()


def configure_ai(c, *, model="script-model", default=True):
    profile = c.post(
        "/api/v2/provider-profiles",
        json={
            "name": "OpenRouter",
            "adapter": "openrouter",
            "default_model": "profile-default",
            "credential": "sk-or-test",
        },
    )
    assert profile.status_code == 200, profile.text
    settings = {
        "default_profile_id": profile.json()["id"] if default else None,
        "model_matrix": {"ai_script_authoring": model} if model else {},
    }
    assert c.put("/api/v2/ai-settings/account", json=settings).status_code == 200
    return profile.json()["id"]


@pytest.fixture
def fake_generate(monkeypatch):
    calls = []

    async def generate(binding, messages, schema, on_delta):
        calls.append({"binding": binding, "messages": messages, "schema": schema})
        return dict(SUGGESTION), {"actual_model": binding["model"], "provider": "openrouter"}

    monkeypatch.setattr(classroom_gateway, "generate", generate)
    return calls


def assist(c, **extra):
    body = {"request": "改成稀缺資源分配的情境", "document": DOC, **extra}
    return c.post("/api/v2/scripts/assist", json=body)


def test_revises_target_question_through_the_role_model(client, fake_generate):
    login(client, "teacher")
    profile_id = configure_ai(client)
    r = assist(client, question_index=0)
    assert r.status_code == 200, r.text
    body = r.json()
    q = body["question"]
    assert q["id"] == "q" and body["question_index"] == 0
    assert q["title"] == SUGGESTION["title"]
    # 「其他」 is added server-side at start; the suggestion carries only real stances.
    assert q["options"] == [
        {"id": "a", "text": "讓年紀最小的人上船"},
        {"id": "b", "text": "抽籤決定"},
    ]
    assert q["duration_seconds"] == 120 and q["max_focus_turns"] == 2
    assert "scenario_ai" not in q
    assert body["rationale"] == SUGGESTION["rationale"]
    assert body["model"] == "script-model"
    (call,) = fake_generate
    assert call["binding"]["profile_id"] == profile_id
    assert call["binding"]["model"] == "script-model"
    assert call["binding"]["role"] == "ai_script_authoring"
    assert call["schema"].__name__ == "ScriptAssistResult"
    prompt = call["messages"][1]["content"]
    assert "改成稀缺資源分配的情境" in prompt and "scenario_ai" not in prompt


def test_new_question_gets_a_fresh_id(client, fake_generate):
    login(client, "teacher")
    configure_ai(client)
    r = assist(client)
    assert r.status_code == 200, r.text
    assert r.json()["question"]["id"].startswith("ai-")
    assert r.json()["question"]["duration_seconds"] == 90


def test_missing_role_model_is_a_clear_error(client, fake_generate):
    login(client, "teacher")
    configure_ai(client, model=None)
    r = assist(client)
    assert r.status_code == 409
    assert r.json()["detail"] == "SCRIPT_ASSIST_MODEL_REQUIRED"
    assert fake_generate == []


def test_missing_provider_profile_is_a_clear_error(client, fake_generate):
    login(client, "teacher")
    configure_ai(client, default=False)
    r = assist(client)
    assert r.status_code == 409
    assert r.json()["detail"] == "SCRIPT_ASSIST_PROVIDER_REQUIRED"
    assert fake_generate == []


def test_provider_wait_surfaces_as_its_code(client, monkeypatch):
    async def refuse(*_):
        raise ProviderWait("PROVIDER_HTTP_401", 60)

    monkeypatch.setattr(classroom_gateway, "generate", refuse)
    login(client, "teacher")
    configure_ai(client)
    r = assist(client)
    assert r.status_code == 502
    assert r.json()["detail"] == "PROVIDER_HTTP_401"


def test_unusable_output_is_rejected(client, monkeypatch):
    async def one_option(binding, *_):
        return {**SUGGESTION, "options": ["只有一個", "其他"]}, {}

    monkeypatch.setattr(classroom_gateway, "generate", one_option)
    login(client, "teacher")
    configure_ai(client)
    r = assist(client)
    assert r.status_code == 502
    assert r.json()["detail"] == "SCRIPT_ASSIST_INVALID_OUTPUT"


def test_only_the_script_owner_can_ask(client, fake_generate):
    login(client, "owner")
    script = client.post("/api/v2/scripts", json={"document": DOC}).json()
    login(client, "intruder")
    configure_ai(client)
    r = assist(client, script_id=script["id"])
    assert r.status_code == 403
    assert r.json()["detail"] == "SCRIPT_OWNER_REQUIRED"
    assert fake_generate == []
    login(client, "owner")
    configure_ai(client)
    assert assist(client, script_id=script["id"]).status_code == 200


def test_requires_a_signed_in_account(client, fake_generate):
    r = assist(client)
    assert r.status_code == 401
    assert fake_generate == []


def test_target_question_must_exist(client, fake_generate):
    login(client, "teacher")
    configure_ai(client)
    r = assist(client, question_index=5)
    assert r.status_code == 422
    assert r.json()["detail"] == "QUESTION_REQUIRED"


def test_revising_keeps_the_personal_stage_settings(client, fake_generate):
    login(client, "teacher")
    configure_ai(client)
    document = {
        **DOC,
        "questions": [{**DOC["questions"][0], "max_personal_turns": 4, "personal_seconds": 300}],
    }
    r = assist(client, document=document, question_index=0)
    assert r.status_code == 200, r.text
    q = r.json()["question"]
    assert q["max_personal_turns"] == 4 and q["personal_seconds"] == 300


# --- 範例題目：the repository's ladder file --------------------------------------


def test_samples_are_the_ladder_stages_as_questions(client):
    from app.config import settings
    from app.ladders.repository import LadderRepository

    login(client, "teacher")
    r = client.get("/api/v2/scripts/samples")
    assert r.status_code == 200, r.text
    body = r.json()
    ladder = LadderRepository.load(settings.ladder_path).get()
    assert body["title"] == ladder.title
    assert [q["id"] for q in body["questions"]] == ["sample-" + s.key for s in ladder.stages]
    for question, stage in zip(body["questions"], ladder.stages):
        # 題目內容照 ladder 原文，不另外改寫。
        assert question["title"] == stage.title
        assert question["scenario"] == stage.opening_statement.strip()
        assert question["tutor_goal"] == stage.teaching_goal.strip()
        assert question["probe_hints"] == stage.probe_hints
        assert len(question["options"]) == 2 and "scenario_ai" not in question
        assert question["max_personal_turns"] == stage.max_turns


def test_samples_need_a_signed_in_account(client):
    assert client.get("/api/v2/scripts/samples").status_code == 401


def test_a_missing_ladder_file_is_a_clear_error(client, monkeypatch, tmp_path):
    from app.config import settings

    login(client, "teacher")
    monkeypatch.setattr(settings, "ladder_path", str(tmp_path / "missing.yaml"))
    r = client.get("/api/v2/scripts/samples")
    assert r.status_code == 503
    assert r.json()["detail"] == "SCRIPT_SAMPLES_UNAVAILABLE"


def test_a_stage_without_listed_options_is_left_out(tmp_path):
    from app.api.routes.script_assist import sample_questions

    path = tmp_path / "ladder.yaml"
    path.write_text(
        "id: x\nversion: 1\ntitle: 範例\nstages:\n"
        "  - {key: unknown, title: 未列選項, opening_statement: 情境, teaching_goal: 目標,"
        " max_turns: 3}\n",
        encoding="utf-8",
    )
    assert sample_questions(str(path)) == {"title": "範例", "questions": []}

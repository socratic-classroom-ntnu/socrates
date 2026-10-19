import os
import re
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.modules.platform.repositories import classroom_storage as storage
from app.classroom_app import create_app
from app.modules.platform.classroom_env import env_str

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"


@pytest.fixture
def client():
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


DOC = {
    "title": "倫理",
    "questions": [
        {
            "id": "q",
            "title": "題目",
            "scenario": "抉擇",
            "options": [{"id": "a", "text": "甲"}, {"id": "b", "text": "乙"}],
        }
    ],
}


def user(c, name="teacher"):
    body = {"username": name, "email": name + "@example.org", "password": "Socratic-123456"}
    assert c.post("/api/v2/auth/register", json=body).status_code == 200
    with storage.transaction() as db:
        mail = db.scalars(select(storage.Mail)).all()[-1]
        token = re.search(r"verify_token=(\S+)", mail.body)[1]
    assert c.post("/api/v2/auth/verify", json={"token": token}).status_code == 200
    r = c.post("/api/v2/auth/login", json={"login": name, "password": body["password"]})
    assert r.status_code == 200
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r.json()


def create(c):
    sc = c.post("/api/v2/scripts", json={"document": DOC}).json()
    r = c.post("/api/v2/classrooms", json={"script_id": sc["id"]})
    assert r.status_code == 200
    return r.json()


def cmd(c, r, kind, data=None, aid=None):
    return c.post(
        "/api/v2/classrooms/" + r["id"] + "/commands",
        json={"kind": kind, "data": data or {}, "action_id": aid or str(uuid.uuid4())},
    )


def test_registration_verification_reset_and_revocation(client):
    user(client)
    r = client.get("/api/v2/auth/me")
    assert r.json()["verified"]
    assert (
        "HttpOnly"
        in client.post(
            "/api/v2/auth/login", json={"login": "teacher", "password": "Socratic-123456"}
        ).headers["set-cookie"]
    )
    client.post("/api/v2/auth/forgot-password", json={"email": "teacher@example.org"})
    with storage.transaction() as db:
        mail = db.scalars(
            select(storage.Mail).where(storage.Mail.subject == "Socratic Classroom 重設密碼")
        ).one()
        token = re.search(r"reset_token=(\S+)", mail.body)[1]
    r = client.post(
        "/api/v2/auth/reset-password", json={"token": token, "password": "New-password123!"}
    )
    assert r.status_code == 200
    assert client.get("/api/v2/auth/me").status_code == 401
    assert (
        client.post(
            "/api/v2/auth/reset-password", json={"token": token, "password": "New-password123!"}
        ).status_code
        == 400
    )


def test_verification_status_has_an_explicit_response_schema(client):
    operation = client.app.openapi()["paths"]["/api/v2/auth/verification-status"]["get"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/VerificationStatusView"
    }


def test_teacher_student_dual_membership_and_start(client):
    user(client)
    r = create(client)
    joined = client.post("/api/v2/classrooms/join", json={"code": r["code"], "alias": "匿名"})
    assert joined.status_code == 200
    assert joined.json()["member_id"]
    assert cmd(client, r, "start").status_code == 200
    x = client.get("/api/v2/classrooms/" + r["id"]).json()
    assert x["phase"] == "countdown"
    assert x["code"] is None
    with storage.transaction() as db:
        assert len(db.scalars(select(storage.Snapshot)).all()) == 1


def test_join_empty_code_is_a_validation_error_and_wrong_code_is_not_found(client):
    user(client)
    r = create(client)
    user(client, "student")
    for empty in ("", "   "):
        res = client.post("/api/v2/classrooms/join", json={"code": empty, "alias": "匿名"})
        assert res.status_code == 422
        assert res.json()["detail"][0]["loc"][-1] == "code"
    res = client.post("/api/v2/classrooms/join", json={"code": "ZZZZ9999", "alias": "匿名"})
    assert res.status_code == 404
    assert res.json()["detail"] == "COURSE_CODE_NOT_FOUND"
    padded = "  " + r["code"].lower() + " "
    res = client.post("/api/v2/classrooms/join", json={"code": padded, "alias": "匿名"})
    assert res.status_code == 200


def test_csrf_required_and_roles_server_owned(client):
    user(client)
    r = create(client)
    client.headers["X-CSRF-Token"] = "wrong"
    assert cmd(client, r, "start").status_code == 403
    user(client, "student")
    assert cmd(client, r, "start").status_code == 403


def test_idempotency_and_payload_conflict(client):
    user(client)
    r = create(client)
    aid = str(uuid.uuid4())
    a = cmd(client, r, "start", aid=aid)
    b = cmd(client, r, "start", aid=aid)
    assert a.status_code == 200
    assert a.json() == b.json()
    assert cmd(client, r, "start", data={"changed": True}, aid=aid).status_code == 409
    with storage.transaction() as db:
        assert len(db.scalars(select(storage.Snapshot)).all()) == 1


def test_late_join_and_snapshot_are_fixed(client):
    user(client)
    r = create(client)
    cmd(client, r, "start")
    user(client, "late")
    assert (
        client.post(
            "/api/v2/classrooms/join", json={"code": r["code"], "alias": "late"}
        ).status_code
        == 409
    )


def test_yaml_roundtrip_and_revision_conflict(client):
    user(client)
    x = client.post("/api/v2/scripts", json={"document": DOC}).json()
    raw = client.get("/api/v2/scripts/" + x["id"] + "/yaml").text
    r = client.post(
        "/api/v2/scripts/import", content=raw, headers={"Content-Type": "application/yaml"}
    )
    assert r.status_code == 200
    assert (
        client.put(
            "/api/v2/scripts/" + x["id"], json={"document": DOC, "expected_revision": 0}
        ).status_code
        == 409
    )


def test_yaml_import_empty_body_returns_specific_json_error(client):
    user(client)
    response = client.post(
        "/api/v2/scripts/import", content=b"", headers={"Content-Type": "application/yaml"}
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"detail": "請貼上 YAML 內容。"}


def test_yaml_import_rejects_content_over_256kb_before_parsing(client):
    user(client)
    response = client.post(
        "/api/v2/scripts/import",
        content=b"x" * (256 * 1024 + 1),
        headers={"Content-Type": "application/yaml"},
    )
    assert response.status_code == 413
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"detail": "YAML 內容最多 256 KB。"}


def test_yaml_import_syntax_error_returns_line_and_column_json(client):
    user(client)
    response = client.post(
        "/api/v2/scripts/import",
        content="title: [\n",
        headers={"Content-Type": "application/yaml"},
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["detail"].startswith("YAML 格式錯誤：第 ")
    assert "行、第 " in response.json()["detail"]
    assert "欄" in response.json()["detail"]


def test_yaml_import_schema_error_returns_field_detail_json(client):
    user(client)
    response = client.post(
        "/api/v2/scripts/import",
        content="title: ''\nquestions: []\n",
        headers={"Content-Type": "application/yaml"},
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert any(item["loc"] == ["title"] and item["type"] == "string_too_short" for item in detail)
    assert any(item["loc"] == ["questions"] and item["type"] == "too_short" for item in detail)


def test_teacher_with_a_long_username_can_open_a_classroom(client):
    # 註冊契約允許 username 到 64 字，所以 membership 的 alias 必須裝得下它；
    # alias 是由 username 推導的，不經過 join body 的 40 字限制。
    long_name = "t" * 64
    user(client, long_name)
    room = create(client)
    assert room["code"]
    with storage.transaction() as db:
        alias = db.scalars(select(storage.Membership.alias)).one()
    assert alias == long_name


# 四語登入頁要能翻譯錯誤，所以帳密錯誤、失效連結、註冊撞號都回穩定代碼，不回中文句子
def test_wrong_password_is_a_stable_code(client):
    user(client, "learner")
    r = client.post(
        "/api/v2/auth/login", json={"login": "learner", "password": "wrong-password-123"}
    )
    assert (r.status_code, r.json()) == (401, {"detail": "AUTH_INVALID_CREDENTIALS"})
    r = client.post(
        "/api/v2/auth/login", json={"login": "nobody", "password": "wrong-password-123"}
    )
    assert (r.status_code, r.json()) == (401, {"detail": "AUTH_INVALID_CREDENTIALS"})


def test_invalid_one_time_token_is_a_stable_code(client):
    verify = client.post("/api/v2/auth/verify", json={"token": "not-a-real-token"})
    reset = client.post(
        "/api/v2/auth/reset-password",
        json={"token": "not-a-real-token", "password": "New-password-123"},
    )
    assert (verify.status_code, verify.json()) == (400, {"detail": "AUTH_TOKEN_INVALID"})
    assert (reset.status_code, reset.json()) == (400, {"detail": "AUTH_TOKEN_INVALID"})


def test_register_race_on_unique_columns_is_a_stable_code(client, monkeypatch):
    from app.modules.identity_access.services import classroom_auth

    user(client, "learner")
    # Simulate losing the race: the pre-check passes, then the unique constraint fires.
    monkeypatch.setattr(classroom_auth, "_claim_identity", lambda *args: None)
    r = client.post(
        "/api/v2/auth/register",
        json={"username": "learner", "email": "other@example.org", "password": "Socratic-123456"},
    )
    assert (r.status_code, r.json()) == (409, {"detail": "ACCOUNT_DATA_TAKEN"})

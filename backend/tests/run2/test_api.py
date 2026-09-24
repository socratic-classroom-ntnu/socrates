import os
import re
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.run2 import storage
from app.run2.server import create_app

os.environ["RUN2_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"


@pytest.fixture
def client():
    storage.configure(os.environ.get("RUN2_TEST_DATABASE_URL", "sqlite://"), create=True)
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
            select(storage.Mail).where(storage.Mail.subject == "Socrates 重設密碼")
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

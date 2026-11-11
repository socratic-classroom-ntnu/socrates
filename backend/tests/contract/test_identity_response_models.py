"""identity-access endpoints publish their response shapes; forgot-password reveals nothing."""

import base64
import hashlib
import hmac
import json
import os
import re
import time

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.classroom_app import create_app
from app.modules.contract.contracts import RESPONSE_MODEL_PENDING
from app.modules.identity_access.repositories import Mail
from app.modules.platform import storage
from app.modules.platform.env import env_str

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"
MODELS = {
    ("POST", "/api/v2/auth/logout"): "SignedOutView",
    ("POST", "/api/v2/auth/verify"): "VerifiedView",
    ("POST", "/api/v2/auth/reset-password"): "PasswordResetView",
    ("POST", "/api/v2/auth/verification-email"): "VerificationMailView",
    ("POST", "/api/v2/auth/forgot-password"): "MailRequestView",
    ("POST", "/api/v2/webhooks/resend"): "ResendWebhookView",
}


@pytest.fixture
def client():
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


def test_every_identity_endpoint_leaves_the_pending_list():
    app = create_app(background=False)
    routes = {
        (method, route.path): route
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods or set()
    }
    paths = app.openapi()["paths"]
    for (method, path), name in MODELS.items():
        assert f"{method} {path}" not in RESPONSE_MODEL_PENDING
        assert routes[(method, path)].response_model is not None
        content = paths[path][method.lower()]["responses"]["200"]["content"]
        assert content["application/json"]["schema"] == {"$ref": f"#/components/schemas/{name}"}


def test_forgot_password_answers_alike_for_registered_and_unknown_emails(client):
    body = {"username": "teacher", "email": "teacher@example.org", "password": "Socratic-123456"}
    assert client.post("/api/v2/auth/register", json=body).status_code == 200
    known = client.post("/api/v2/auth/forgot-password", json={"email": "teacher@example.org"})
    unknown = client.post("/api/v2/auth/forgot-password", json={"email": "nobody@example.org"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def register(c, name="teacher"):
    body = {"username": name, "email": f"{name}@example.org", "password": "Socratic-123456"}
    r = c.post("/api/v2/auth/register", json=body)
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return body


def mailed_token(kind):
    with storage.transaction() as db:
        return re.search(rf"{kind}_token=(\S+)", db.scalars(select(Mail)).all()[-1].body)[1]


def test_each_token_endpoint_publishes_only_the_status_it_returns():
    schemas = create_app(background=False).openapi()["components"]["schemas"]
    assert schemas["VerifiedView"]["properties"]["status"]["const"] == "VERIFIED"
    assert schemas["PasswordResetView"]["properties"]["status"]["const"] == "PASSWORD_RESET"


def test_token_endpoints_answer_exactly(client):
    body = register(client)
    verified = client.post("/api/v2/auth/verify", json={"token": mailed_token("verify")})
    assert verified.json() == {"status": "VERIFIED"}
    client.post("/api/v2/auth/forgot-password", json={"email": body["email"]})
    reset = client.post(
        "/api/v2/auth/reset-password",
        json={"token": mailed_token("reset"), "password": "Socratic-654321"},
    )
    assert reset.json() == {"status": "PASSWORD_RESET"}


def test_verification_mail_has_delivery_only_when_a_mail_was_queued(client):
    register(client)
    queued = client.post("/api/v2/auth/verification-email", json={"email": "teacher@example.org"})
    assert set(queued.json()) == {"status", "message", "delivery"}
    client.post("/api/v2/auth/verify", json={"token": mailed_token("verify")})
    done = client.post("/api/v2/auth/verification-email", json={"email": "teacher@example.org"})
    assert done.json() == {"status": "ALREADY_VERIFIED", "message": "帳號已完成 Email 驗證。"}


def test_an_unmatched_webhook_has_no_provider_status(client, monkeypatch):
    secret = b"test-webhook-secret"
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", "whsec_" + base64.b64encode(secret).decode())
    body = json.dumps({"type": "email.delivered", "data": {}}).encode()
    timestamp, event_id = str(int(time.time())), "msg_unmatched"
    signed = f"{event_id}.{timestamp}.".encode() + body
    signature = base64.b64encode(hmac.new(secret, signed, hashlib.sha256).digest()).decode()
    headers = {
        "svix-id": event_id,
        "svix-timestamp": timestamp,
        "svix-signature": "v1," + signature,
    }
    r = client.post("/api/v2/webhooks/resend", content=body, headers=headers)
    assert r.json() == {"status": "RECORDED", "matched": False}

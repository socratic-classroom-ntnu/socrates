"""identity-access endpoints publish their response shapes; forgot-password reveals nothing."""

import os

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.classroom_app import create_app
from app.modules.contract.contracts import RESPONSE_MODEL_PENDING
from app.modules.platform import storage
from app.modules.platform.env import env_str

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"
MODELS = {
    ("POST", "/api/v2/auth/logout"): "SignedOutView",
    ("POST", "/api/v2/auth/verify"): "TokenUsedView",
    ("POST", "/api/v2/auth/reset-password"): "TokenUsedView",
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

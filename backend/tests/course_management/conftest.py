import os
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.classroom_app import create_app
from app.modules.course_management.repositories import models as course_models  # noqa: F401
from app.modules.platform.classroom_env import env_str
from app.modules.platform.repositories import classroom_storage as storage

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"

PASSWORD = "Socratic-123456"


@pytest.fixture
def client():
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as test_client:
        yield test_client


def user(client: TestClient, name: str = "teacher") -> dict:
    body = {"username": name, "email": f"{name}@example.org", "password": PASSWORD}
    assert client.post("/api/v2/auth/register", json=body).status_code == 200
    with storage.transaction() as db:
        mail = db.scalars(select(storage.Mail)).all()[-1]
        token = re.search(r"verify_token=(\S+)", mail.body)
        assert token is not None
    assert client.post("/api/v2/auth/verify", json={"token": token[1]}).status_code == 200
    response = client.post("/api/v2/auth/login", json={"login": name, "password": PASSWORD})
    assert response.status_code == 200
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return response.json()


def switch(client: TestClient, account: dict) -> dict:
    response = client.post(
        "/api/v2/auth/login",
        json={"login": account["username"], "password": PASSWORD},
    )
    assert response.status_code == 200
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return response.json()

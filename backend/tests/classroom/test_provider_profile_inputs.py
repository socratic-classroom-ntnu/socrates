"""AI 連線的輸入：同名連線回 409（不再 500）；金鑰夾帶引號、全形字或空白時在送出前就退回。"""

import pytest
from fastapi.testclient import TestClient

from app.classroom_app import create_app
from app.modules.ai_providers.contracts import clean_credential
from app.modules.platform import storage
from tests.classroom.test_script_assist import login


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


def create(c, name, **extra):
    body = {"name": name, "adapter": "openrouter", "default_model": "openrouter/free", **extra}
    return c.post("/api/v2/provider-profiles", json=body)


def test_duplicate_profile_name_is_a_409_not_a_500(client):
    login(client, "dup_owner")
    assert create(client, "fizzy").status_code == 200
    again = create(client, "fizzy")
    assert again.status_code == 409
    assert again.json()["detail"] == "PROVIDER_PROFILE_NAME_TAKEN"
    other = create(client, "second")
    assert other.status_code == 200
    renamed = client.patch(
        f"/api/v2/provider-profiles/{other.json()['id']}", json={"name": "fizzy"}
    )
    assert renamed.status_code == 409
    assert renamed.json()["detail"] == "PROVIDER_PROFILE_NAME_TAKEN"


def test_same_name_is_fine_for_another_account(client):
    login(client, "owner_a")
    assert create(client, "shared").status_code == 200
    login(client, "owner_b")
    assert create(client, "shared").status_code == 200


@pytest.mark.parametrize(
    "pasted", ['"sk-or-v1-abcd1234"', "sk-or-v1-abcd1234。", "sk-or v1-abcd1234", "ｓｋ-or-v1-abcd"]
)
def test_malformed_credential_is_rejected_before_any_provider_call(client, pasted):
    login(client, "key_owner")
    r = create(client, "k", credential=pasted)
    assert r.status_code == 422
    assert "PROVIDER_CREDENTIAL_MALFORMED" in r.text


def test_zero_width_and_outer_whitespace_are_removed():
    assert clean_credential("​sk-or-v1-abcd1234﻿ ") == "sk-or-v1-abcd1234"
    assert clean_credential(None) is None

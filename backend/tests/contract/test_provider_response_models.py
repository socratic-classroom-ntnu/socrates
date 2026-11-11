"""ai-providers endpoints publish their response shapes, and what they return fits them."""

import time

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.classroom_app import create_app
from app.modules.ai_providers import classroom_gateway
from app.modules.contract.contracts import RESPONSE_MODEL_PENDING
from app.modules.platform import storage
from tests.classroom.test_script_assist import login

PROFILE = "/api/v2/provider-profiles/{profile_id}"
MODELS = {
    ("GET", "/api/v2/meta/revision"): "RevisionView",
    ("POST", "/api/v2/provider-profiles"): "ProfileView",
    ("PATCH", PROFILE): "ProfileView",
    ("POST", PROFILE + "/credential"): "ProfileView",
    ("DELETE", PROFILE): "ProfileDeletedView",
    ("POST", PROFILE + "/test"): "ConnectionTestView",
    ("GET", PROFILE + "/models"): "ModelDiscoveryView",
    ("GET", "/api/v2/ai-settings/account"): "AISettingsView",
    ("PUT", "/api/v2/ai-settings/account"): "AISettingsView",
}
MODEL = {
    "id": "openai/gpt-x",
    "name": "GPT X",
    "pricing": {"prompt": "0.000001"},
    "supported_parameters": ["response_format"],
    "structured_outputs": True,
    "reasoning": None,
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CLASSROOM_COOKIE_SECURE", "false")
    monkeypatch.setenv("SOCRATES_ALLOWED_ORIGINS", "http://testserver")
    # Credentials are sealed with a key derived from DATABASE_URL, as in the other profile tests.
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@db/socrates")
    storage.configure("sqlite://", create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


def test_every_provider_endpoint_leaves_the_pending_list():
    app = create_app(background=False)
    routes = {
        (method, route.path): route
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods or set()
    }
    paths = app.openapi()["paths"]
    listed = paths["/api/v2/provider-profiles"]["get"]["responses"]["200"]["content"]
    assert listed["application/json"]["schema"]["items"] == {
        "$ref": "#/components/schemas/ProfileView"
    }
    for (method, path), name in MODELS.items():
        assert f"{method} {path}" not in RESPONSE_MODEL_PENDING
        assert routes[(method, path)].response_model is not None
        content = paths[path][method.lower()]["responses"]["200"]["content"]
        assert content["application/json"]["schema"] == {"$ref": f"#/components/schemas/{name}"}
    assert "GET /api/v2/provider-profiles" not in RESPONSE_MODEL_PENDING


def test_each_endpoint_answers_within_its_model(client, monkeypatch):
    async def discover(binding):
        return {
            "provider_profile_id": binding["profile_id"],
            "adapter": binding["adapter"],
            "models": [MODEL],
            "manual_model_id_allowed": True,
            "observed_at": time.time(),
        }

    async def test_connection(binding):
        result = await discover(binding)
        return {
            "status": "READY",
            "provider_profile_id": binding["profile_id"],
            "adapter": binding["adapter"],
            "model_count": len(result["models"]),
            "sample": result["models"][:10],
            "observed_at": result["observed_at"],
        }

    monkeypatch.setattr(classroom_gateway, "discover_models", discover)
    monkeypatch.setattr(classroom_gateway, "test_connection", test_connection)
    login(client, "owner")
    assert client.get("/api/v2/meta/revision").json()["schema"] == "socrates/revision/v1"
    body = {"name": "mine", "adapter": "openrouter", "default_model": "openrouter/free"}
    profile = client.post("/api/v2/provider-profiles", json=body).json()
    path = f"/api/v2/provider-profiles/{profile['id']}"
    assert client.get("/api/v2/provider-profiles").json()[0]["id"] == profile["id"]
    assert client.patch(path, json={"name": "renamed"}).json()["name"] == "renamed"
    keyed = client.post(
        path + "/credential", json={"credential": "sk-test-1234", "credential_mode": "SESSION"}
    )
    assert keyed.status_code == 200 and keyed.json()["has_credential"] is True
    assert client.get(path + "/models").json()["models"] == [MODEL]
    assert client.post(path + "/test").json()["sample"] == [MODEL]
    settings = client.put("/api/v2/ai-settings/account", json={"default_profile_id": profile["id"]})
    assert settings.status_code == 200, settings.text
    assert client.get("/api/v2/ai-settings/account").json()["default_profile_id"] == profile["id"]
    client.put("/api/v2/ai-settings/account", json={"default_profile_id": None})
    assert client.delete(path).json() == {"status": "DELETED", "profile_id": profile["id"]}

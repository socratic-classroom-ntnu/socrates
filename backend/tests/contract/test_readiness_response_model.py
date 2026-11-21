from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.classroom_app import create_app
from app.modules.contract.contracts import RESPONSE_MODEL_PENDING
from app.modules.platform import storage
from app.modules.platform.env import env_str

READINESS = "GET /api/v2/readiness"


def test_readiness_publishes_a_response_model():
    app = create_app(background=False)
    (route,) = [r for r in app.routes if isinstance(r, APIRoute) and r.path == "/api/v2/readiness"]
    assert route.response_model is not None
    assert READINESS not in RESPONSE_MODEL_PENDING
    schema = app.openapi()["paths"]["/api/v2/readiness"]["get"]["responses"]["200"]
    assert schema["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ReadinessView"
    }


def test_readiness_body_is_unchanged():
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as client:
        response = client.get("/api/v2/readiness")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "connected", "runtime": "classroom"}

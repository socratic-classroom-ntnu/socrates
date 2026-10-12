from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import pytest

from app.api.routes.public_config import public_config, require_debug_mode
from app.classroom_env import env_bool


def test_debug_mode_defaults_off(monkeypatch):
    monkeypatch.delenv("SOCRATES_DEBUG_MODE", raising=False)
    assert public_config()["debug_mode"] is False


@pytest.mark.parametrize("value", ["1", "true", "YES", "on"])
def test_debug_mode_accepts_true_spellings(monkeypatch, value):
    monkeypatch.setenv("SOCRATES_DEBUG_MODE", value)
    assert public_config()["debug_mode"] is True


@pytest.mark.parametrize("value", ["0", "false", "NO", "off"])
def test_debug_mode_accepts_false_spellings(monkeypatch, value):
    monkeypatch.setenv("SOCRATES_DEBUG_MODE", value)
    assert public_config()["debug_mode"] is False


def test_invalid_debug_flag_is_configuration_error(monkeypatch):
    monkeypatch.setenv("SOCRATES_DEBUG_MODE", "sometimes")
    with pytest.raises(ValueError, match="SOCRATES_DEBUG_MODE"):
        env_bool("SOCRATES_DEBUG_MODE")


def test_debug_dependency_returns_404_when_disabled(monkeypatch):
    app = FastAPI()

    @app.get("/debug/ping", dependencies=[Depends(require_debug_mode)])
    def ping():
        return {"state": "ready"}

    monkeypatch.setenv("SOCRATES_DEBUG_MODE", "false")
    response = TestClient(app).get("/debug/ping")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}

    monkeypatch.setenv("SOCRATES_DEBUG_MODE", "true")
    response = TestClient(app).get("/debug/ping")
    assert response.status_code == 200
    assert response.json() == {"state": "ready"}

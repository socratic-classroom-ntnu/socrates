from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import pytest

from app.modules.platform.routes import public_config
from app.modules.platform.service import require_debug_mode
from app.modules.platform.env import env_bool


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


# 快速登入：只在 seed 會建出測試帳號的環境回傳帳密，其他環境（含沒設定）一律沒有
DEMO = {
    "password": "preview-password",
    "accounts": [
        {"username": "teacher001", "role": "teacher"},
        {"username": "user001", "role": "student"},
    ],
}


@pytest.mark.parametrize("environment", ["local-dev", "preview", "stage", "dev"])
def test_demo_login_in_seeded_environments(monkeypatch, environment):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", environment)
    assert public_config()["demo_login"] == DEMO


@pytest.mark.parametrize("environment", ["production", "prod", "master", "", "Stage", " stage"])
def test_no_demo_login_elsewhere(monkeypatch, environment):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", environment)
    assert public_config()["demo_login"] is None


def test_no_demo_login_when_environment_unset(monkeypatch):
    # 其他地方把沒設定當成 local-dev；這裡不行，正式環境漏設不能變成公開帳密
    monkeypatch.delenv("SOCRATES_ENVIRONMENT", raising=False)
    assert public_config()["demo_login"] is None

"""The AI 連線設定 runs on the classroom app; reuse course_management's app fixture."""

import pytest

from app.modules.ai_connection import service as checks
from app.modules.ai_providers import service as ai_service
from app.modules.platform.errors import DomainError
from tests.course_management.conftest import client  # noqa: F401


@pytest.fixture
def probes(monkeypatch):
    """Every connection tested, in order; set `fail` to a code to make the next test fail, or
    `during` to a function that runs while the provider is being asked."""
    tried: list[ai_service.PlatformConfig] = []
    state: dict = {"fail": None, "during": None}

    async def fake(config, owner_id, *, prefix):
        assert prefix == "AI_CONNECTION"
        tried.append(config)
        if state["during"]:
            state.pop("during")()
        if state["fail"]:
            raise DomainError(state["fail"], 424)
        return config

    monkeypatch.setattr(checks, "probe", fake)
    return tried, state

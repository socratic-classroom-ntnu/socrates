"""The admin module runs on the classroom app; reuse course_management's app fixture."""

from dataclasses import replace

import pytest

from app.modules.platform import toggles
from tests.course_management.conftest import client  # noqa: F401
from tests.solo_activity.conftest import tutor  # noqa: F401 — the scripted provider (報表)


@pytest.fixture(autouse=True)
def _group_mode_production_default(monkeypatch, _group_mode_on_for_existing_tests):
    """Here 多人模式 keeps its production default: off until an admin turns it on (spec P7)."""
    monkeypatch.setitem(
        toggles.DB_TOGGLES, "group_mode", replace(toggles.DB_TOGGLES["group_mode"], default=False)
    )

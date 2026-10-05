"""New CLASSROOM_* names win; the old RUN2_* names still work for one release."""

import pytest

from app import classroom_env


@pytest.mark.parametrize(
    "new_name,old_name",
    [
        ("CLASSROOM_LLM_DAILY_BUDGET", "RUN2_LLM_DAILY_BUDGET"),
        ("CLASSROOM_LLM_WORKERS", "RUN2_LLM_WORKERS"),
    ],
)
def test_old_env_name_is_still_honoured(monkeypatch, new_name, old_name):
    monkeypatch.delenv(new_name, raising=False)
    monkeypatch.setenv(old_name, "4321")
    assert classroom_env.env_int(new_name, 0) == 4321


def test_new_env_name_wins_over_the_old_one(monkeypatch):
    monkeypatch.setenv("CLASSROOM_LLM_DAILY_BUDGET", "111")
    monkeypatch.setenv("RUN2_LLM_DAILY_BUDGET", "222")
    assert classroom_env.env_int("CLASSROOM_LLM_DAILY_BUDGET", 0) == 111

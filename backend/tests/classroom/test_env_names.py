"""The classroom app reads its CLASSROOM_* settings under those names, and the default otherwise."""

import pytest

from app.modules.platform import env as classroom_env


def test_a_set_name_is_read(monkeypatch):
    monkeypatch.setenv("CLASSROOM_LLM_WORKERS", "4321")
    assert classroom_env.env_int("CLASSROOM_LLM_WORKERS", 0) == 4321
    assert classroom_env.env_str("CLASSROOM_LLM_WORKERS") == "4321"


def test_an_unset_name_gives_the_default(monkeypatch):
    monkeypatch.delenv("CLASSROOM_AI_CALL_BUDGET", raising=False)
    assert classroom_env.env_int("CLASSROOM_AI_CALL_BUDGET", 240) == 240
    assert classroom_env.env_str("CLASSROOM_AI_CALL_BUDGET", "x") == "x"


def test_a_blank_int_is_an_error(monkeypatch):
    monkeypatch.setenv("CLASSROOM_LLM_WORKERS", "")
    with pytest.raises(ValueError):
        classroom_env.env_int("CLASSROOM_LLM_WORKERS", 1)

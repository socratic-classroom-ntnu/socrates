"""Solo activities run on courses and activities; reuse course_management's app fixture."""

import json

import pytest

from app.modules.llm_runtime.tutor import classroom_gateway
from tests.course_management.conftest import client  # noqa: F401


@pytest.fixture
def tutor(monkeypatch):
    """A scripted provider: each call pops the next reply; an Exception entry is raised."""
    calls: list[dict] = []
    replies: list = []

    async def generate(binding, messages, schema, on_delta):
        calls.append({"binding": binding, "messages": messages, "schema": schema})
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if callable(reply):
            reply = reply()
        return json.loads(json.dumps(reply)), {"provider": binding["adapter"]}

    monkeypatch.setattr(classroom_gateway, "generate", generate)
    return calls, replies

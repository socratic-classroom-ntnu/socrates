"""Teacher end must be accepted by the group command HTTP endpoint."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.classroom_app import create_app
from tests.classroom.test_groups import classroom, start  # noqa: F401


def test_teacher_can_end_a_group_run(classroom):  # noqa: F811
    result, _ = start(classroom)
    group_id = result["groups"][0]["id"]
    with TestClient(create_app(background=False)) as client:
        response = client.post(
            f"/api/v2/groups/runs/{group_id}/commands",
            json={"action_id": uuid4().hex, "kind": "end", "data": {}},
        )
    assert response.status_code == 200, response.text

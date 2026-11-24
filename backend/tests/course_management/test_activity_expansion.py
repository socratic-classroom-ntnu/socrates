"""The narrative activity's stance space: written from the narrative, edited by the teacher, and
locked into the revision on publish.

The teacher asks for a stance space (``POST /activities/{id}/expansion``), edits it (``PUT``), and
publishing copies it into the ActivityRevision with the narrative. A started attempt keeps the
revision it started on, so editing the narrative or the stance space afterwards changes nothing it
sees; once the revision is locked the stance space can no longer be changed (EXPANSION_LOCKED).
"""

import json

import pytest
from sqlalchemy import select

from app.modules.ai_providers import classroom_gateway

from app.modules.course_management.repositories import Activity, ActivityRevision
from app.modules.platform import storage as storage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import act, create_activity, draft
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import configure_ai, join

EXPANSION = {
    "stances": [
        {
            "id": "s1",
            "label": "拉桿",
            "description": "救五個人比較重要，少一個人受害是比較好的結果。",
        },
        {"id": "s2", "label": "不拉", "description": "親手讓人死去和任其發生不同，不能主動害人。"},
    ],
    "tutor_goal": "讓學生分辨結果與行為本身的對錯。",
    "probe_hints": ["如果那個人是你的朋友，你的答案會變嗎？"],
}
EDITED = {
    **EXPANSION,
    "stances": [
        *EXPANSION["stances"],
        {"id": "s3", "label": "看情況", "description": "要看能不能先警告工人。"},
    ],
}


@pytest.fixture
def tutor(monkeypatch):
    """A scripted provider, as in the solo activity tests: each call pops the next reply."""
    calls: list[dict] = []
    replies: list = []

    async def generate(binding, messages, schema, on_delta):
        calls.append({"binding": binding, "messages": messages, "schema": schema})
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return json.loads(json.dumps(reply)), {"provider": binding["adapter"]}

    monkeypatch.setattr(classroom_gateway, "generate", generate)
    return calls, replies


def teacher_activity(client, *, ai=True):
    teacher = user(client, "owner", account_role="teacher")
    if ai:
        configure_ai(client)
    course = create_course(client)
    activity = create_activity(client, course["id"])
    return teacher, course, activity


def expand(client, activity_id):
    return client.post(f"/api/v2/activities/{activity_id}/expansion")


def edit(client, activity_id, body):
    return client.put(f"/api/v2/activities/{activity_id}/expansion", json=body)


def revision_content(activity_id):
    with storage.transaction() as db:
        activity = db.get(Activity, activity_id)
        return db.get(ActivityRevision, activity.current_revision_id).content


def test_a_new_activity_has_no_stance_space(client):
    _, _, activity = teacher_activity(client, ai=False)
    assert activity["expansion"] is None


def test_the_stance_space_is_written_from_the_narrative(client, tutor):
    calls, replies = tutor
    _, _, activity = teacher_activity(client)
    replies.append(EXPANSION)
    response = expand(client, activity["id"])
    assert response.status_code == 200, response.text
    assert response.json()["expansion"] == EXPANSION
    context = json.loads(calls[0]["messages"][1]["content"])
    assert context["narrative"] == draft()["scenario"]
    assert context["output_locale"]
    # Asking again writes a new one; the teacher keeps whichever they last asked for.
    replies.append(EDITED)
    assert expand(client, activity["id"]).json()["expansion"] == EDITED


def test_without_a_connection_nothing_is_written(client, tutor):
    calls, _ = tutor
    _, _, activity = teacher_activity(client, ai=False)
    response = expand(client, activity["id"])
    assert response.status_code == 424
    assert response.json()["detail"] == "EXPANSION_UNAVAILABLE"
    assert calls == []
    assert client.get(f"/api/v2/activities/{activity['id']}").json()["expansion"] is None


def test_a_failed_call_keeps_the_stance_space_the_teacher_had(client, tutor):
    _, replies = tutor
    _, _, activity = teacher_activity(client)
    assert edit(client, activity["id"], EXPANSION).status_code == 200
    replies.append(RuntimeError("provider down"))
    response = expand(client, activity["id"])
    assert response.status_code == 424
    assert response.json()["detail"] == "EXPANSION_UNAVAILABLE"
    assert client.get(f"/api/v2/activities/{activity['id']}").json()["expansion"] == EXPANSION


def test_the_teacher_edits_the_stance_space(client):
    _, _, activity = teacher_activity(client, ai=False)
    response = edit(client, activity["id"], EXPANSION)
    assert response.status_code == 200, response.text
    assert response.json()["expansion"] == EXPANSION
    duplicate = {**EXPANSION, "stances": [EXPANSION["stances"][0]] * 2}
    assert edit(client, activity["id"], duplicate).status_code == 422
    assert (
        edit(client, activity["id"], {**EXPANSION, "stances": EXPANSION["stances"][:1]}).status_code
        == 422
    )


def test_saving_the_draft_keeps_the_stance_space(client):
    _, _, activity = teacher_activity(client, ai=False)
    edit(client, activity["id"], EXPANSION)
    body = draft(scenario="電車駛向五名工人，你可以推下橋上的一個人擋住它。")
    response = client.put(f"/api/v2/activities/{activity['id']}", json=body)
    assert response.status_code == 200, response.text
    assert response.json()["expansion"] == EXPANSION


def test_only_the_course_teacher_reaches_the_stance_space(client):
    _, course, activity = teacher_activity(client, ai=False)
    join(client, course, "student")
    assert edit(client, activity["id"], EXPANSION).status_code == 404
    assert expand(client, activity["id"]).status_code == 404


def test_publish_locks_the_stance_space_into_the_revision(client):
    _, _, activity = teacher_activity(client, ai=False)
    edit(client, activity["id"], EXPANSION)
    assert act(client, activity["id"], "publish").status_code == 200
    content = revision_content(activity["id"])
    assert content["scenario"] == draft()["scenario"]
    assert content["stance_space"] == EXPANSION["stances"]
    assert content["tutor_goal"] == EXPANSION["tutor_goal"]
    assert content["probe_hints"] == EXPANSION["probe_hints"]
    view = client.get(f"/api/v2/activities/{activity['id']}").json()
    assert view["has_unpublished_changes"] is False


def test_an_activity_without_a_stance_space_still_publishes(client):
    _, _, activity = teacher_activity(client, ai=False)
    assert act(client, activity["id"], "publish").status_code == 200
    assert "stance_space" not in revision_content(activity["id"])


def test_editing_after_publish_waits_for_the_next_publish(client):
    _, _, activity = teacher_activity(client, ai=False)
    edit(client, activity["id"], EXPANSION)
    act(client, activity["id"], "publish")
    view = edit(client, activity["id"], EDITED).json()
    assert view["has_unpublished_changes"] is True
    assert revision_content(activity["id"])["stance_space"] == EXPANSION["stances"]
    act(client, activity["id"], "publish")
    assert revision_content(activity["id"])["stance_space"] == EDITED["stances"]


def test_a_started_attempt_keeps_its_narrative_and_stance_space(client, tutor):
    teacher, course, activity = teacher_activity(client)
    edit(client, activity["id"], EXPANSION)
    act(client, activity["id"], "publish")
    join(client, course, "student")
    started = client.post(f"/api/v2/solo/activities/{activity['id']}/attempt")
    assert started.status_code == 200, started.text
    switch(client, teacher)
    locked = edit(client, activity["id"], EDITED)
    assert locked.status_code == 409
    assert locked.json()["detail"] == "EXPANSION_LOCKED"
    assert expand(client, activity["id"]).json()["detail"] == "EXPANSION_LOCKED"
    body = draft(scenario="另一段敘述")
    assert client.put(f"/api/v2/activities/{activity['id']}", json=body).status_code == 409
    content = revision_content(activity["id"])
    assert content["scenario"] == draft()["scenario"]
    assert content["stance_space"] == EXPANSION["stances"]


def test_a_copy_keeps_the_stance_space(client):
    _, _, activity = teacher_activity(client, ai=False)
    edit(client, activity["id"], EXPANSION)
    copied = client.post(f"/api/v2/activities/{activity['id']}/copy")
    assert copied.status_code == 201, copied.text
    assert copied.json()["expansion"] == EXPANSION
    with storage.transaction() as db:
        assert len(db.scalars(select(Activity)).all()) == 2

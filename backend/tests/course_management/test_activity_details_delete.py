"""Locked-activity details edits, soft delete, and the unpublished-changes flag (M2)."""

import time

import pytest
from sqlalchemy import select, text

from app.modules.course_management.repositories.models import ActivityRevision
from app.modules.course_management.services import activities as activity_service
from app.modules.platform.repositories import classroom_storage as storage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import (
    act,
    create_activity,
    draft,
    enrolled_student,
    question,
    student_items,
    teacher_with_course,
)


def view(client, activity_id):
    response = client.get(f"/api/v2/activities/{activity_id}")
    assert response.status_code == 200, response.text
    return response.json()


def teacher_card(client, course_id, activity_id):
    response = client.get(f"/api/v2/courses/{course_id}/activities?role=teacher")
    assert response.status_code == 200, response.text
    return next(item for item in response.json()["items"] if item["id"] == activity_id)


def patch(client, activity_id, body):
    return client.patch(f"/api/v2/activities/{activity_id}", json=body)


def lock(activity_id):
    with storage.transaction() as db:
        activity_service.lock_current_revision(db, activity_id)


def revisions(activity_id):
    with storage.transaction() as db:
        rows = db.scalars(
            select(ActivityRevision)
            .where(ActivityRevision.activity_id == activity_id)
            .order_by(ActivityRevision.number)
        ).all()
        return [(row.id, row.number, row.content_hash) for row in rows]


def published(client, course_id, **overrides):
    activity = create_activity(client, course_id, **overrides)
    response = act(client, activity["id"], "publish")
    assert response.status_code == 200, response.text
    return response.json()


def student_titles(client, course, teacher):
    enrolled_student(client, course, name=f"s{time.monotonic_ns()}")
    titles = [item["title"] for item in student_items(client, course["id"])]
    switch(client, teacher)
    return titles


def test_patch_details_on_locked_activity(client):
    teacher, course = teacher_with_course(client)
    activity = published(client, course["id"])
    lock(activity["id"])
    before = revisions(activity["id"])
    new_end = time.time() + 7200

    response = patch(client, activity["id"], {"title": "新名稱", "ends_at": new_end})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["draft"]["title"] == "新名稱"
    assert body["ends_at"] == pytest.approx(new_end)
    assert body["draft"]["ends_at"] == pytest.approx(new_end)
    assert revisions(activity["id"]) == before
    assert student_titles(client, course, teacher) == ["新名稱"]
    put = client.put(f"/api/v2/activities/{activity['id']}", json=draft(title="偷改"))
    assert put.status_code == 409 and put.json() == {"detail": "ACTIVITY_LOCKED"}


def test_patch_details_rejects_bad_end(client):
    teacher, course = teacher_with_course(client)
    opened = published(client, course["id"])
    starts = time.time() + 3600
    scheduled = published(client, course["id"], starts_at=starts, ends_at=starts + 3600)

    past = patch(client, opened["id"], {"title": "改了", "ends_at": time.time() - 1})
    before_start = patch(client, scheduled["id"], {"title": "改了", "ends_at": starts - 1})

    for response in (past, before_start):
        assert response.status_code == 422
        assert response.json() == {"detail": "ACTIVITY_TIME_INVALID"}
    for original in (opened, scheduled):
        current = view(client, original["id"])
        assert current["draft"]["title"] == "第三週倫理討論"
        assert current["ends_at"] == pytest.approx(original["ends_at"])


def test_patch_details_unavailable_for_draft_and_ended(client):
    teacher, course = teacher_with_course(client)
    unpublished = create_activity(client, course["id"])
    ended = published(client, course["id"])
    assert act(client, ended["id"], "end_now").status_code == 200

    for activity in (unpublished, ended):
        response = patch(client, activity["id"], {"title": "改了"})
        assert response.status_code == 409
        assert response.json() == {"detail": "ACTIVITY_ACTION_UNAVAILABLE"}


def test_patch_details_requires_a_field(client):
    teacher, course = teacher_with_course(client)
    activity = published(client, course["id"])

    assert patch(client, activity["id"], {}).status_code == 422
    assert patch(client, activity["id"], {"title": None}).status_code == 422
    assert patch(client, activity["id"], {"ends_at": None}).status_code == 422


def test_unpublished_title_edit_not_shown_to_students(client):
    teacher, course = teacher_with_course(client)
    activity = published(client, course["id"])
    client.put(f"/api/v2/activities/{activity['id']}", json=draft(title="還沒發布"))

    assert teacher_card(client, course["id"], activity["id"])["title"] == "還沒發布"
    assert student_titles(client, course, teacher) == ["第三週倫理討論"]
    assert act(client, activity["id"], "publish").status_code == 200
    assert student_titles(client, course, teacher) == ["還沒發布"]


def _one_of_each(client, course_id):
    starts = time.time() + 3600
    unpublished = create_activity(client, course_id)
    scheduled = published(client, course_id, starts_at=starts, ends_at=starts + 3600)
    opened = published(client, course_id)
    locked = published(client, course_id)
    lock(locked["id"])
    ended = published(client, course_id)
    act(client, ended["id"], "end_now")
    return [unpublished, scheduled, opened, locked, ended]


def test_soft_delete_keeps_rows_but_hides_activity(client):
    teacher, course = teacher_with_course(client)
    activities = _one_of_each(client, course["id"])
    before = {a["id"]: revisions(a["id"]) for a in activities}
    with storage.transaction() as db:
        current = {
            a["id"]: db.execute(
                text("select current_revision_id from activities where id = :id"),
                {"id": a["id"]},
            ).scalar_one()
            for a in activities
        }

    for activity in activities:
        response = client.delete(f"/api/v2/activities/{activity['id']}")
        assert response.status_code == 204, response.text

    for activity in activities:
        aid = activity["id"]
        for response in (
            client.get(f"/api/v2/activities/{aid}"),
            client.put(f"/api/v2/activities/{aid}", json=draft()),
            patch(client, aid, {"title": "改了"}),
            act(client, aid, "copy"),
            act(client, aid, "publish"),
            client.delete(f"/api/v2/activities/{aid}"),
        ):
            assert response.status_code == 404, response.text
            assert response.json() == {"detail": "ACTIVITY_NOT_FOUND"}
    with storage.transaction() as db:
        for activity in activities:
            row = db.execute(
                text("select deleted, current_revision_id from activities where id = :id"),
                {"id": activity["id"]},
            ).one()
            assert bool(row.deleted) is True
            assert row.current_revision_id == current[activity["id"]]
    assert {a["id"]: revisions(a["id"]) for a in activities} == before
    teacher_items = client.get(f"/api/v2/courses/{course['id']}/activities?role=teacher").json()
    assert teacher_items["items"] == []
    enrolled_student(client, course)
    assert student_items(client, course["id"]) == []
    preview = client.get(f"/api/v2/activities/{activities[2]['id']}/join-preview")
    assert preview.status_code == 404
    assert preview.json() == {"detail": "ACTIVITY_NOT_FOUND"}


def test_unpublished_change_flag_tracks_revision(client):
    teacher, course = teacher_with_course(client)
    activity = published(client, course["id"])
    assert view(client, activity["id"])["has_unpublished_changes"] is False
    assert teacher_card(client, course["id"], activity["id"])["has_unpublished_changes"] is False

    changed = draft(questions=[question(title="天橋上的陌生人")])
    assert client.put(f"/api/v2/activities/{activity['id']}", json=changed).status_code == 200
    assert view(client, activity["id"])["has_unpublished_changes"] is True
    assert teacher_card(client, course["id"], activity["id"])["has_unpublished_changes"] is True

    assert act(client, activity["id"], "publish").status_code == 200
    assert view(client, activity["id"])["has_unpublished_changes"] is False

    lock(activity["id"])
    response = patch(client, activity["id"], {"title": "改名", "ends_at": time.time() + 9000})
    assert response.status_code == 200
    assert response.json()["has_unpublished_changes"] is False


def test_unpublished_change_flag_for_drafts_is_false(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])

    assert view(client, activity["id"])["has_unpublished_changes"] is False


def test_lock_between_update_and_publish_keeps_pending_flag(client):
    teacher, course = teacher_with_course(client)
    activity = published(client, course["id"])
    changed = draft(questions=[question(title="天橋上的陌生人")])
    assert client.put(f"/api/v2/activities/{activity['id']}", json=changed).status_code == 200
    lock(activity["id"])

    publish = act(client, activity["id"], "publish")
    assert publish.status_code == 409
    assert view(client, activity["id"])["has_unpublished_changes"] is True
    patched = patch(client, activity["id"], {"title": "改名", "ends_at": time.time() + 9000})
    assert patched.status_code == 200
    assert patched.json()["has_unpublished_changes"] is True
    copy = act(client, activity["id"], "copy")
    assert copy.status_code == 201
    assert copy.json()["draft"]["questions"][0]["title"] == "天橋上的陌生人"
    with storage.transaction() as db:
        revision = db.scalars(
            select(ActivityRevision).where(ActivityRevision.activity_id == activity["id"])
        ).one()
        assert revision.content["questions"][0]["title"] == "岔道上的選擇"


def test_start_and_end_now_do_not_flag_pending(client):
    teacher, course = teacher_with_course(client)
    starts = time.time() + 3600
    activity = published(client, course["id"], starts_at=starts, ends_at=starts + 3600)

    started = act(client, activity["id"], "start_now")
    assert started.status_code == 200
    body = started.json()
    assert body["has_unpublished_changes"] is False
    assert body["draft"]["starts_at"] == pytest.approx(body["starts_at"])

    ended = act(client, activity["id"], "end_now")
    assert ended.status_code == 200
    body = ended.json()
    assert body["has_unpublished_changes"] is False
    assert body["draft"]["ends_at"] == pytest.approx(body["ends_at"])


def test_course_background_edit_does_not_flag_pending(client):
    teacher, course = teacher_with_course(client)
    unlocked = published(client, course["id"])
    locked = published(client, course["id"])
    lock(locked["id"])

    response = client.patch(
        f"/api/v2/courses/{course['id']}", json={"intro": "新簡介", "goals": "新目標"}
    )
    assert response.status_code == 200

    for activity in (unlocked, locked):
        assert view(client, activity["id"])["has_unpublished_changes"] is False
    with storage.transaction() as db:
        revision = db.scalars(
            select(ActivityRevision).where(ActivityRevision.activity_id == unlocked["id"])
        ).one()
        assert revision.content["course_intro"] == ""


def test_student_cannot_delete_or_patch(client):
    teacher, course = teacher_with_course(client)
    activity = published(client, course["id"])
    enrolled_student(client, course)

    deleted = client.delete(f"/api/v2/activities/{activity['id']}")
    patched = patch(client, activity["id"], {"title": "學生改的"})

    for response in (deleted, patched):
        assert response.status_code == 404
        assert response.json() == {"detail": "COURSE_NOT_FOUND"}
    switch(client, teacher)
    assert view(client, activity["id"])["draft"]["title"] == "第三週倫理討論"


def test_delete_requires_csrf(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    client.headers["X-CSRF-Token"] = "wrong"

    response = client.delete(f"/api/v2/activities/{activity['id']}")

    assert response.status_code == 403
    switch(client, teacher)
    assert view(client, activity["id"])["status"] == "draft"


def test_other_teacher_cannot_delete(client):
    owner, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    user(client, "intruder")

    response = client.delete(f"/api/v2/activities/{activity['id']}")

    assert response.status_code == 404
    switch(client, owner)
    assert view(client, activity["id"])["status"] == "draft"

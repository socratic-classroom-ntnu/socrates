import threading
import time

import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from app.modules.course_management.repositories.models import Activity, ActivityRevision, Enrollment
from app.modules.course_management.services import activities as activity_service
from app.modules.platform.classroom_env import env_str
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories import classroom_storage as storage
from tests.course_management.conftest import switch, user
from tests.course_management.test_courses_api import create_course

TEST_DIALECT = make_url(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://")).get_backend_name()


def question(qid="q1", title="岔道上的選擇", options=("拉", "不拉")):
    return {
        "id": qid,
        "title": title,
        "scenario": "一輛失控的電車正駛向五名工人。",
        "options": [{"id": f"o{i}", "text": text} for i, text in enumerate(options)],
    }


def draft(**overrides):
    body = {
        "title": "第三週倫理討論",
        "topic_direction": "從電車難題出發，探討主動與不作為的責任。",
        "ends_at": time.time() + 3600,
        "questions": [question()],
    }
    body.update(overrides)
    return body


def teacher_with_course(client):
    teacher = user(client, "owner")
    course = create_course(client)
    return teacher, course


def create_activity(client, course_id, **overrides):
    response = client.post(f"/api/v2/courses/{course_id}/activities", json=draft(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def act(client, activity_id, action):
    return client.post(f"/api/v2/activities/{activity_id}/{action}")


def count(model):
    with storage.transaction() as db:
        return db.scalar(select(func.count()).select_from(model))


def student_items(client, course_id):
    response = client.get(f"/api/v2/courses/{course_id}/activities")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "student"
    return body["items"]


def enrolled_student(client, course, name="student"):
    account = user(client, name)
    assert (
        client.post(
            "/api/v2/courses/join", json={"code": course["code"], "display_name": "學生"}
        ).status_code
        == 200
    )
    return account


def test_draft_hidden_from_students(client):
    teacher, course = teacher_with_course(client)
    create_activity(client, course["id"])
    enrolled_student(client, course)

    assert student_items(client, course["id"]) == []


@pytest.mark.parametrize(
    "broken",
    [
        {"title": ""},
        {"topic_direction": " "},
        {"ends_at": None},
        {"questions": []},
        {"questions": [question(title="")]},
        {"questions": [question(options=("拉", " "))]},
        {"questions": [question(options=("拉",))]},
    ],
)
def test_save_requires_complete_activity(client, broken):
    teacher, course = teacher_with_course(client)
    saved = create_activity(client, course["id"])

    created = client.post(f"/api/v2/courses/{course['id']}/activities", json=draft(**broken))
    updated = client.put(f"/api/v2/activities/{saved['id']}", json=draft(**broken))

    assert created.status_code == updated.status_code == 422
    assert count(Activity) == 1
    assert client.get(f"/api/v2/activities/{saved['id']}").json()["draft"] == saved["draft"]
    assert count(ActivityRevision) == 0


def test_saved_draft_roundtrip(client):
    teacher, course = teacher_with_course(client)
    body = draft(analysis_focus="改變立場的條件")

    created = client.post(f"/api/v2/courses/{course['id']}/activities", json=body).json()
    fetched = client.get(f"/api/v2/activities/{created['id']}").json()

    assert created["status"] == "draft"
    assert created["revision"] is None
    assert created["available_actions"] == ["update", "publish", "copy"]
    assert fetched["draft"] == {
        **body,
        "starts_at": None,
        "questions": fetched["draft"]["questions"],
    }
    assert fetched["draft"]["questions"][0]["follow_up_direction"] == ""


def test_publish_immediately_opens(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])

    before = time.time()
    published = act(client, activity["id"], "publish")
    after = time.time()

    assert published.status_code == 200, published.text
    assert published.json()["status"] == "open"
    assert published.json()["revision"] == 1
    assert before <= published.json()["starts_at"] <= after


@pytest.mark.parametrize(
    "window",
    [
        {"starts_at": time.time() + 7200, "ends_at": time.time() + 3600},
        {"ends_at": time.time() - 60},
    ],
)
def test_publish_rejects_bad_window(client, window):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"], **window)

    response = act(client, activity["id"], "publish")

    assert response.status_code == 422
    assert response.json() == {"detail": "ACTIVITY_TIME_INVALID"}
    assert client.get(f"/api/v2/activities/{activity['id']}").json()["revision"] is None
    assert count(ActivityRevision) == 0


def test_republish_before_lock_creates_revision_2(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")

    client.put(f"/api/v2/activities/{activity['id']}", json=draft(title="改過的標題"))
    republished = act(client, activity["id"], "publish")

    assert republished.status_code == 200
    assert republished.json()["revision"] == 2
    assert count(ActivityRevision) == 2


def test_scheduled_update_can_republish_revision_2(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"], starts_at=time.time() + 600)
    scheduled = act(client, activity["id"], "publish").json()
    assert scheduled["status"] == "scheduled"

    updated = client.put(
        f"/api/v2/activities/{activity['id']}",
        json=draft(starts_at=time.time() + 900, title="改期"),
    ).json()

    assert "publish" in updated["available_actions"]
    assert act(client, activity["id"], "publish").json()["revision"] == 2


def test_locked_activity_rejects_update_and_publish(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")
    with storage.transaction() as db:
        activity_service.lock_current_revision(db, activity["id"])

    view = client.get(f"/api/v2/activities/{activity['id']}").json()
    put = client.put(f"/api/v2/activities/{activity['id']}", json=draft(title="偷改"))
    publish = act(client, activity["id"], "publish")
    copied = act(client, activity["id"], "copy")

    assert view["locked"] is True
    assert view["available_actions"] == ["end_now", "copy"]
    assert put.status_code == 409 and put.json() == {"detail": "ACTIVITY_LOCKED"}
    assert publish.status_code == 409
    assert publish.json() == {"detail": "ACTIVITY_ACTION_UNAVAILABLE"}
    assert copied.status_code == 201
    copy = copied.json()
    assert copy["id"] != activity["id"]
    assert copy["status"] == "draft" and copy["locked"] is False
    original_q = view["draft"]["questions"][0]
    copied_q = copy["draft"]["questions"][0]
    assert copied_q["id"] != original_q["id"]
    assert [o["id"] for o in copied_q["options"]] != [o["id"] for o in original_q["options"]]
    assert copied_q["title"] == original_q["title"]
    assert [o["text"] for o in copied_q["options"]] == [o["text"] for o in original_q["options"]]


@pytest.mark.skipif(TEST_DIALECT != "postgresql", reason="requires PostgreSQL row locks")
def test_lock_current_revision_wins_race_with_republish(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")
    locked = threading.Event()
    release = threading.Event()
    outcome: dict = {}

    def first_student_starts():
        with storage.transaction() as db:
            activity_service.lock_current_revision(db, activity["id"])
            locked.set()
            release.wait(timeout=5)

    def teacher_republishes():
        try:
            with storage.transaction() as db:
                row = db.get(Activity, activity["id"])
                activity_service.publish(db, row, time.time())
            outcome["result"] = "published"
        except DomainError as error:
            outcome["result"] = error.code

    starter = threading.Thread(target=first_student_starts)
    starter.start()
    assert locked.wait(timeout=5)
    publisher = threading.Thread(target=teacher_republishes)
    publisher.start()
    publisher.join(timeout=0.5)
    assert publisher.is_alive(), "publish must wait for the activity row lock"
    release.set()
    starter.join(timeout=5)
    publisher.join(timeout=5)

    assert outcome["result"] == "ACTIVITY_LOCKED"
    assert count(ActivityRevision) == 1


def test_end_now_ends_and_join_rejected(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")

    ended = act(client, activity["id"], "end_now")
    user(client, "student")
    joined = client.post(f"/api/v2/activities/{activity['id']}/join", json={"display_name": "學生"})

    assert ended.json()["status"] == "ended"
    assert ended.json()["available_actions"] == ["copy"]
    assert joined.status_code == 409
    assert joined.json() == {"detail": "ACTIVITY_ENDED"}


def test_activity_qr_enrolls_once(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")
    account = user(client, "student")

    preview = client.get(f"/api/v2/activities/{activity['id']}/join-preview").json()
    first = client.post(f"/api/v2/activities/{activity['id']}/join", json={"display_name": "小美"})
    second = client.post(f"/api/v2/activities/{activity['id']}/join", json={"display_name": "別名"})

    assert preview["already_enrolled"] is False
    assert preview["default_display_name"] == account["username"]
    assert preview["course_name"] == course["name"]
    assert preview["question_count"] == 1
    assert first.status_code == second.status_code == 200
    assert first.json() == {
        "course_id": course["id"],
        "activity_id": activity["id"],
        "enrolled_now": True,
    }
    assert second.json()["enrolled_now"] is False
    assert count(Enrollment) == 1
    assert [item["id"] for item in student_items(client, course["id"])] == [activity["id"]]


def test_activity_join_static_route_precedes_teacher_action_route(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")

    response = client.post(
        f"/api/v2/activities/{activity['id']}/join", json={"display_name": "老師"}
    )

    assert response.status_code == 200
    assert response.json()["activity_id"] == activity["id"]


def test_draft_activity_cannot_be_joined(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    user(client, "student")

    preview = client.get(f"/api/v2/activities/{activity['id']}/join-preview")
    joined = client.post(f"/api/v2/activities/{activity['id']}/join", json={"display_name": "學生"})

    assert preview.status_code == joined.status_code == 404
    assert joined.json() == {"detail": "ACTIVITY_NOT_FOUND"}


def test_student_cannot_mutate_activity(client):
    teacher, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")
    enrolled_student(client, course)

    put = client.put(f"/api/v2/activities/{activity['id']}", json=draft(title="學生改的"))
    publish = act(client, activity["id"], "publish")
    read = client.get(f"/api/v2/activities/{activity['id']}")
    create = client.post(f"/api/v2/courses/{course['id']}/activities", json=draft())

    for response in (put, publish, read, create):
        assert response.status_code == 404
        assert response.json() == {"detail": "COURSE_NOT_FOUND"}


def test_teacher_list_includes_drafts_with_actions(client):
    teacher, course = teacher_with_course(client)
    create_activity(client, course["id"])

    body = client.get(f"/api/v2/courses/{course['id']}/activities").json()

    assert body["role"] == "teacher"
    assert body["items"][0]["status"] == "draft"
    assert body["items"][0]["available_actions"] == ["update", "publish", "copy"]
    assert body["items"][0]["question_count"] == 1


def test_server_clock_decides(client, monkeypatch):
    teacher, course = teacher_with_course(client)
    starts = time.time() + 600
    activity = create_activity(client, course["id"], starts_at=starts, ends_at=starts + 600)
    act(client, activity["id"], "publish")
    enrolled_student(client, course)

    assert student_items(client, course["id"])[0]["status"] == "scheduled"
    monkeypatch.setattr(activity_service, "now", lambda: starts + 1)
    assert student_items(client, course["id"])[0]["status"] == "open"
    monkeypatch.setattr(activity_service, "now", lambda: starts + 601)
    assert student_items(client, course["id"])[0]["status"] == "ended"


def test_student_sees_published_title_not_unpublished_edit(client):
    teacher_account, course = teacher_with_course(client)
    activity = create_activity(client, course["id"])
    act(client, activity["id"], "publish")
    client.put(f"/api/v2/activities/{activity['id']}", json=draft(title="還沒發布的新標題"))
    enrolled_student(client, course)

    assert student_items(client, course["id"])[0]["title"] == "第三週倫理討論"
    switch(client, teacher_account)

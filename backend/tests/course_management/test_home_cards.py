"""Home-page course cards: teaching counts, the learning highlight, and bounded queries (M2)."""

import time

from sqlalchemy import event

from app.modules.course_management.services import activities as activity_service
from app.modules.platform.repositories import classroom_storage as storage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import (
    act,
    create_activity,
    enrolled_student,
    teacher_with_course,
)
from tests.course_management.test_courses_api import create_course


def lists(client):
    response = client.get("/api/v2/courses")
    assert response.status_code == 200, response.text
    return response.json()


def publish(client, course_id, **overrides):
    activity = create_activity(client, course_id, **overrides)
    response = act(client, activity["id"], "publish")
    assert response.status_code == 200, response.text
    return activity


def join(client, code):
    response = client.post("/api/v2/courses/join", json={"code": code, "display_name": "我"})
    assert response.status_code == 200, response.text


def test_teaching_card_counts(client):
    teacher, course = teacher_with_course(client)
    create_activity(client, course["id"])
    publish(client, course["id"])
    ended = publish(client, course["id"])
    act(client, ended["id"], "end_now")
    enrolled_student(client, course, "student1")
    enrolled_student(client, course, "student2")
    switch(client, teacher)

    card = lists(client)["teaching"][0]

    assert card == {
        "id": course["id"],
        "name": "科技倫理",
        "teacher_name": "Fizzy",
        "code": course["code"],
        "code_enabled": True,
        "student_count": 2,
        "activity_count": 3,
        "open_activity_count": 1,
    }


def test_learning_card_highlight_order(client, monkeypatch):
    clock = [time.time()]
    monkeypatch.setattr(activity_service, "now", lambda: clock[0])
    start = clock[0]
    teacher, course = teacher_with_course(client)
    ended = publish(client, course["id"], title="已結束", ends_at=start + 50)
    clock[0] = start + 1
    act(client, ended["id"], "end_now")
    scheduled = publish(
        client, course["id"], title="排程中", starts_at=start + 1000, ends_at=start + 2000
    )
    later = publish(client, course["id"], title="晚結束", ends_at=start + 500)
    sooner = publish(client, course["id"], title="早結束", ends_at=start + 300)
    enrolled_student(client, course)
    clock[0] = start + 2

    card = lists(client)["learning"][0]
    assert card["open_activity_count"] == 2
    assert card["highlight"]["id"] == sooner["id"]
    assert card["highlight"]["status"] == "open"
    assert card["highlight"]["title"] == "早結束"
    assert card["highlight"]["question_count"] == 1

    switch(client, teacher)
    clock[0] = start + 3
    act(client, later["id"], "end_now")
    clock[0] = start + 4
    act(client, sooner["id"], "end_now")
    student = enrolled_student(client, course, "student2")
    assert lists(client)["learning"][0]["highlight"]["id"] == scheduled["id"]

    switch(client, teacher)
    assert client.delete(f"/api/v2/activities/{scheduled['id']}").status_code == 204
    switch(client, student)
    highlight = lists(client)["learning"][0]["highlight"]
    assert highlight["id"] == sooner["id"] and highlight["status"] == "ended"


def test_learning_card_never_shows_drafts(client):
    teacher, course = teacher_with_course(client)
    create_activity(client, course["id"])
    enrolled_student(client, course)

    card = lists(client)["learning"][0]

    assert card == {
        "id": course["id"],
        "name": "科技倫理",
        "teacher_name": "Fizzy",
        "open_activity_count": 0,
        "highlight": None,
    }


def test_learning_card_uses_renamed_title(client):
    teacher, course = teacher_with_course(client)
    activity = publish(client, course["id"])
    with storage.transaction() as db:
        activity_service.lock_current_revision(db, activity["id"])
    response = client.patch(f"/api/v2/activities/{activity['id']}", json={"title": "改過的名稱"})
    assert response.status_code == 200, response.text
    enrolled_student(client, course)

    assert lists(client)["learning"][0]["highlight"]["title"] == "改過的名稱"


def test_deleted_activity_is_excluded_everywhere(client):
    teacher, course = teacher_with_course(client)
    kept = publish(client, course["id"], title="留下的")
    gone = publish(client, course["id"], title="刪掉的", ends_at=time.time() + 600)
    join(client, course["code"])
    assert client.delete(f"/api/v2/activities/{gone['id']}").status_code == 204

    both = lists(client)
    teaching, learning = both["teaching"][0], both["learning"][0]
    assert teaching["activity_count"] == 1
    assert teaching["open_activity_count"] == 1
    assert learning["open_activity_count"] == 1
    assert learning["highlight"]["id"] == kept["id"]
    preview = client.get(f"/api/v2/course-join/preview?code={course['code']}")
    assert preview.json()["open_activity_title"] == "留下的"
    for url in (
        f"/api/v2/activities/{gone['id']}/join-preview",
        f"/api/v2/activities/{gone['id']}/public-preview",
    ):
        response = client.get(url)
        assert response.status_code == 404, url
        assert response.json() == {"detail": "ACTIVITY_NOT_FOUND"}


def _account_with_courses(client, name, how_many):
    user(client, name)
    for index in range(how_many):
        course = create_course(client, name=f"{name}-{index}")
        publish(client, course["id"])
        create_activity(client, course["id"])
        join(client, course["code"])


def _queries_for_course_lists(client):
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = storage.engine()
    event.listen(engine, "before_cursor_execute", record)
    try:
        body = lists(client)
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return len(statements), body


def test_home_cards_use_bounded_queries(client):
    _account_with_courses(client, "one", 1)
    one, one_body = _queries_for_course_lists(client)
    _account_with_courses(client, "five", 5)
    five, five_body = _queries_for_course_lists(client)

    assert len(one_body["teaching"]) == 1 and len(five_body["learning"]) == 5
    assert all(card["highlight"] is not None for card in five_body["learning"])
    assert one == five

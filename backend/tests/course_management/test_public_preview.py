"""Anonymous join previews: the J0 banner gets the course name and nothing else (M2)."""

from tests.course_management.test_activities_api import act, create_activity, teacher_with_course


def anonymous(client):
    client.cookies.clear()
    client.headers.pop("X-CSRF-Token", None)


def test_public_course_preview_returns_name_only(client):
    teacher, course = teacher_with_course(client)
    anonymous(client)

    response = client.get(f"/api/v2/course-join/public-preview?code={course['code'].lower()}")

    assert response.status_code == 200, response.text
    assert response.json() == {"course_name": "科技倫理"}


def test_public_course_preview_hides_bad_codes(client):
    teacher, course = teacher_with_course(client)
    assert client.post(f"/api/v2/courses/{course['id']}/disable_code").status_code == 200
    anonymous(client)

    for code in ("ZZZZZZZZ", course["code"]):
        response = client.get(f"/api/v2/course-join/public-preview?code={code}")
        assert response.status_code == 404
        assert response.json() == {"detail": "ENROLL_CODE_NOT_FOUND"}


def test_public_activity_preview(client):
    teacher, course = teacher_with_course(client)
    published = create_activity(client, course["id"])
    assert act(client, published["id"], "publish").status_code == 200
    unpublished = create_activity(client, course["id"])
    anonymous(client)

    ok = client.get(f"/api/v2/activities/{published['id']}/public-preview")
    assert ok.status_code == 200, ok.text
    assert ok.json() == {"course_name": "科技倫理"}
    for activity_id in (unpublished["id"], "no-such-activity"):
        response = client.get(f"/api/v2/activities/{activity_id}/public-preview")
        assert response.status_code == 404
        assert response.json() == {"detail": "ACTIVITY_NOT_FOUND"}


def test_public_preview_rate_limited(client):
    anonymous(client)

    statuses = [
        client.get("/api/v2/course-join/public-preview?code=ZZZZZZZZ").status_code
        for _ in range(100)
    ]
    blocked = client.get("/api/v2/activities/whatever/public-preview")

    assert set(statuses) == {404}
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "RATE_LIMITED"}

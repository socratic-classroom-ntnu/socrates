"""Joining a course without registering (免註冊加入): the course switch, the previews, becoming a
guest and joining in one step, and what a guest may use afterwards.

A guest is made and enrolled in one transaction: when the join fails nothing is left behind, not
even a cookie. Turning the switch off only stops guests who have not joined yet.
"""

from sqlalchemy import func, select

from app.modules.course_management import guest_records
from app.modules.course_management.repositories import Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import act, create_activity
from tests.course_management.test_courses_api import create_course


def accounts() -> int:
    with storage.transaction() as db:
        return db.scalar(select(func.count()).select_from(Account))


def teacher_course(client, **overrides):
    teacher = user(client)
    return teacher, create_course(client, **overrides)


def open_activity(client, course_id):
    activity = create_activity(client, course_id)
    assert act(client, activity["id"], "publish").status_code == 200
    return activity


def leave(client):
    """Signed out on this device, as a student scanning a QR code on their own phone is."""
    client.cookies.clear()
    client.headers.pop("X-CSRF-Token", None)


def guest_join(client, code, nickname="安靜的貓頭鷹", locale="zh-Hant"):
    response = client.post(
        "/api/v2/course-join/guest", json={"code": code, "nickname": nickname, "locale": locale}
    )
    if response.status_code == 200:
        client.headers["X-CSRF-Token"] = response.json()["account"]["csrf_token"]
    return response


def as_guest(response):
    """After a successful guest join the client acts as that guest."""
    assert response.status_code == 200, response.text
    return response.json()


def allow_guests(client, course_id, allowed: bool):
    response = client.patch(f"/api/v2/courses/{course_id}", json={"allow_guest": allowed})
    assert response.status_code == 200, response.text
    return response.json()


# ---- the switch ----------------------------------------------------------------------------


def test_a_new_course_allows_guests_and_the_teacher_can_turn_it_off(client):
    _, course = teacher_course(client)
    assert course["allow_guest"] is True
    assert allow_guests(client, course["id"], False)["allow_guest"] is False
    again = client.get(f"/api/v2/courses/{course['id']}?role=teacher").json()
    assert again["allow_guest"] is False


def test_the_switch_cannot_be_set_to_null(client):
    _, course = teacher_course(client)
    response = client.patch(f"/api/v2/courses/{course['id']}", json={"allow_guest": None})
    assert response.status_code == 422


# ---- previews ------------------------------------------------------------------------------


def test_the_public_previews_say_whether_guests_may_join(client):
    _, course = teacher_course(client)
    activity = open_activity(client, course["id"])
    leave(client)
    course_view = client.get(f"/api/v2/course-join/public-preview?code={course['code']}")
    assert course_view.json() == {"course_name": "科技倫理", "allow_guest": True}
    activity_view = client.get(f"/api/v2/activities/{activity['id']}/public-preview")
    assert activity_view.json() == {
        "course_name": "科技倫理",
        "allow_guest": True,
        "status": "open",
    }


def test_an_ended_activity_preview_says_it_has_ended(client):
    _, course = teacher_course(client)
    activity = open_activity(client, course["id"])
    assert act(client, activity["id"], "end_now").status_code == 200
    leave(client)
    view = client.get(f"/api/v2/activities/{activity['id']}/public-preview").json()
    assert view["status"] == "ended"


def test_the_signed_in_previews_say_it_too_and_name_a_guest_by_the_nickname(client):
    teacher, course = teacher_course(client)
    activity = open_activity(client, course["id"])
    allow_guests(client, course["id"], False)
    second = create_course(client, name="哲學")
    second_activity = open_activity(client, second["id"])
    leave(client)
    as_guest(guest_join(client, second["code"], nickname="小-明"))
    preview = client.get(f"/api/v2/course-join/preview?code={course['code']}").json()
    assert (preview["allow_guest"], preview["default_display_name"]) == (False, "小-明")
    joined = client.get(f"/api/v2/activities/{second_activity['id']}/join-preview").json()
    assert (joined["allow_guest"], joined["already_enrolled"]) == (True, True)
    other = client.get(f"/api/v2/activities/{activity['id']}/join-preview").json()
    assert (other["allow_guest"], other["default_display_name"]) == (False, "小-明")


# ---- becoming a guest and joining ----------------------------------------------------------


def test_a_guest_joins_a_course_in_one_step(client):
    _, course = teacher_course(client)
    leave(client)
    response = guest_join(client, course["code"], nickname="  安靜的貓頭鷹 ")
    result = as_guest(response)
    assert "socrates_session=" in response.headers["set-cookie"]
    assert result["course_id"] == course["id"] and result["activity_id"] is None
    assert result["account"]["kind"] == "guest"
    assert result["account"]["display_name"] == "安靜的貓頭鷹"
    me = client.get("/api/v2/auth/me").json()
    assert me["id"] == result["account"]["id"]
    page = client.get(f"/api/v2/courses/{course['id']}")
    assert page.status_code == 200, page.text
    assert page.json()["display_name"] == "安靜的貓頭鷹"


def test_a_course_that_does_not_allow_guests_leaves_no_guest_and_no_cookie(client):
    _, course = teacher_course(client)
    allow_guests(client, course["id"], False)
    leave(client)
    before = accounts()
    response = guest_join(client, course["code"])
    assert (response.status_code, response.json()) == (403, {"detail": "GUEST_JOIN_DISABLED"})
    assert "set-cookie" not in response.headers
    assert accounts() == before


def test_a_wrong_code_leaves_no_guest(client):
    teacher_course(client)
    leave(client)
    before = accounts()
    response = guest_join(client, "ZZZZZZ")
    assert (response.status_code, response.json()) == (404, {"detail": "ENROLL_CODE_NOT_FOUND"})
    assert "set-cookie" not in response.headers
    assert accounts() == before


def test_a_guest_from_an_activity_qr_joins_the_course_and_the_activity(client):
    _, course = teacher_course(client)
    activity = open_activity(client, course["id"])
    leave(client)
    response = client.post(
        f"/api/v2/activities/{activity['id']}/guest-join",
        json={"nickname": "安靜的貓頭鷹", "locale": "en"},
    )
    result = as_guest(response)
    assert (result["course_id"], result["activity_id"], result["activity_status"]) == (
        course["id"],
        activity["id"],
        "open",
    )
    assert client.get(f"/api/v2/courses/{course['id']}").status_code == 200


def test_an_ended_or_closed_activity_leaves_no_guest(client):
    _, course = teacher_course(client)
    ended = open_activity(client, course["id"])
    assert act(client, ended["id"], "end_now").status_code == 200
    closed_course = create_course(client, name="不開放")
    closed = open_activity(client, closed_course["id"])
    allow_guests(client, closed_course["id"], False)
    leave(client)
    before = accounts()
    body = {"nickname": "安靜的貓頭鷹", "locale": "en"}
    first = client.post(f"/api/v2/activities/{ended['id']}/guest-join", json=body)
    assert (first.status_code, first.json()) == (409, {"detail": "ACTIVITY_ENDED"})
    second = client.post(f"/api/v2/activities/{closed['id']}/guest-join", json=body)
    assert (second.status_code, second.json()) == (403, {"detail": "GUEST_JOIN_DISABLED"})
    assert accounts() == before


def test_sending_the_guest_join_twice_makes_one_guest(client):
    """A retry after a lost response: the first join already signed this device in."""
    _, course = teacher_course(client)
    leave(client)
    first = as_guest(guest_join(client, course["code"]))["account"]
    before = accounts()
    again = guest_join(client, course["code"], nickname="另一個名字")
    assert (again.status_code, again.json()) == (409, {"detail": "ALREADY_SIGNED_IN"})
    assert "set-cookie" not in again.headers
    assert accounts() == before
    assert client.get("/api/v2/auth/me").json()["id"] == first["id"]
    with storage.transaction() as db:
        names = db.scalars(
            select(Enrollment.display_name).where(Enrollment.course_id == course["id"])
        ).all()
    assert names == ["安靜的貓頭鷹"]


def test_a_signed_in_student_is_not_turned_into_a_guest(client):
    _, course = teacher_course(client)
    activity = open_activity(client, course["id"])
    student = user(client, "student")
    before = accounts()
    for response in (
        guest_join(client, course["code"]),
        client.post(
            f"/api/v2/activities/{activity['id']}/guest-join",
            json={"nickname": "安靜的貓頭鷹", "locale": "en"},
        ),
    ):
        assert (response.status_code, response.json()) == (409, {"detail": "ALREADY_SIGNED_IN"})
        assert "set-cookie" not in response.headers
    assert accounts() == before
    assert client.get("/api/v2/auth/me").json()["id"] == student["id"]


def test_an_expired_guest_may_join_again_as_a_new_guest(client):
    _, course = teacher_course(client)
    leave(client)
    old = as_guest(guest_join(client, course["code"]))["account"]
    with storage.transaction() as db:
        db.get(Account, old["id"]).guest_expires_at = 1.0
    fresh = as_guest(guest_join(client, course["code"], nickname="新的"))["account"]
    assert fresh["id"] != old["id"]


def test_a_guest_nickname_is_checked_like_any_name(client):
    _, course = teacher_course(client)
    leave(client)
    assert guest_join(client, course["code"], nickname="   ").status_code == 422
    assert guest_join(client, course["code"], nickname="字" * 41).status_code == 422


# ---- what a guest may use ------------------------------------------------------------------


def test_a_guest_uses_the_student_pages(client):
    _, course = teacher_course(client)
    open_activity(client, course["id"])
    leave(client)
    as_guest(guest_join(client, course["code"]))
    lists = client.get("/api/v2/courses")
    assert lists.status_code == 200, lists.text
    assert [item["id"] for item in lists.json()["learning"]] == [course["id"]]
    items = client.get(f"/api/v2/courses/{course['id']}/activities")
    assert items.status_code == 200, items.text
    assert len(items.json()["items"]) == 1


def test_a_guest_joins_another_course_only_where_guests_are_allowed(client):
    _, first = teacher_course(client)
    allowed = create_course(client, name="可以")
    closed = create_course(client, name="不行")
    closed_activity = open_activity(client, closed["id"])
    allow_guests(client, closed["id"], False)
    leave(client)
    as_guest(guest_join(client, first["code"]))
    ok = client.post(
        "/api/v2/courses/join", json={"code": allowed["code"], "display_name": "貓頭鷹"}
    )
    assert ok.status_code == 200, ok.text
    refused = client.post(
        "/api/v2/courses/join", json={"code": closed["code"], "display_name": "貓頭鷹"}
    )
    assert (refused.status_code, refused.json()) == (403, {"detail": "GUEST_JOIN_DISABLED"})
    by_activity = client.post(
        f"/api/v2/activities/{closed_activity['id']}/join", json={"display_name": "貓頭鷹"}
    )
    assert (by_activity.status_code, by_activity.json()) == (403, {"detail": "GUEST_JOIN_DISABLED"})


def test_turning_guests_off_keeps_the_guests_already_in(client):
    teacher, course = teacher_course(client)
    leave(client)
    guest = as_guest(guest_join(client, course["code"]))
    guest_cookies = dict(client.cookies)
    guest_csrf = guest["account"]["csrf_token"]
    leave(client)
    switch(client, teacher)
    allow_guests(client, course["id"], False)
    leave(client)
    for name, value in guest_cookies.items():
        client.cookies.set(name, value)
    client.headers["X-CSRF-Token"] = guest_csrf
    assert client.get(f"/api/v2/courses/{course['id']}").status_code == 200
    again = client.post("/api/v2/courses/join", json={"code": course["code"], "display_name": "x"})
    assert again.status_code == 200, again.text


def test_a_guest_still_cannot_teach(client):
    _, course = teacher_course(client)
    leave(client)
    as_guest(guest_join(client, course["code"]))
    created = client.post("/api/v2/courses", json={"name": "我的課", "teacher_name": "我"})
    assert (created.status_code, created.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})
    patched = client.patch(f"/api/v2/courses/{course['id']}", json={"allow_guest": False})
    assert (patched.status_code, patched.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})
    teacher_view = client.get(f"/api/v2/courses/{course['id']}?role=teacher")
    assert teacher_view.status_code == 404


# ---- the guest record hook (reassign, forget_name) -----------------------------------------


def enrollment_of(account_id, course_id):
    with storage.transaction() as db:
        row = db.scalar(
            select(Enrollment).where(
                Enrollment.account_id == account_id, Enrollment.course_id == course_id
            )
        )
        return None if row is None else (row.id, row.display_name)


def test_reassign_moves_a_course_only_the_guest_was_in(client):
    _, course = teacher_course(client)
    student = user(client, "student")
    leave(client)
    guest = as_guest(guest_join(client, course["code"]))["account"]
    with storage.transaction() as db:
        guest_records.HOOK.reassign(db, guest["id"], student["id"])
    assert enrollment_of(guest["id"], course["id"]) is None
    assert enrollment_of(student["id"], course["id"])[1] == "安靜的貓頭鷹"


def test_reassign_keeps_the_accounts_enrollment_when_both_are_in(client):
    _, course = teacher_course(client)
    student = user(client, "student")
    joined = client.post(
        "/api/v2/courses/join", json={"code": course["code"], "display_name": "小明"}
    )
    assert joined.status_code == 200
    leave(client)
    guest = as_guest(guest_join(client, course["code"]))["account"]
    kept = enrollment_of(student["id"], course["id"])
    with storage.transaction() as db:
        guest_records.HOOK.reassign(db, guest["id"], student["id"])
    assert enrollment_of(student["id"], course["id"]) == kept
    assert enrollment_of(guest["id"], course["id"]) is None


def test_forget_name_clears_the_name_in_the_course_and_keeps_the_enrollment(client):
    _, course = teacher_course(client)
    leave(client)
    guest = as_guest(guest_join(client, course["code"]))["account"]
    with storage.transaction() as db:
        guest_records.HOOK.forget_name(db, guest["id"])
    assert enrollment_of(guest["id"], course["id"])[1] == ""

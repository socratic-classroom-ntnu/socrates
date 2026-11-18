"""意見回饋：誰都能送（登入、訪客、未登入），只有名單上的帳號看得到；截圖 90 天後清掉。

決策見 spec P1–P20；這裡只測後端看得到的規則。
"""

import base64
import time

from sqlalchemy import select

from app.modules.feedback import service as feedback_service
from app.modules.feedback.repositories import Feedback
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from tests.course_management.conftest import user
from tests.course_management.test_guest_join import guest_join, leave, teacher_course

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64


def body(**overrides):
    value = {
        "kind": "problem",
        "message": "按「加入」之後一直轉圈",
        "page": "/learn/courses/abc",
        "viewport": {"w": 1280, "h": 860},
        "locale": "zh-Hant",
    }
    value.update(overrides)
    return value


def shot(data: bytes, mime: str = "image/png") -> dict:
    return {"mime": mime, "data_base64": base64.b64encode(data).decode()}


def send(client, **overrides):
    return client.post("/api/v2/feedback", json=body(**overrides))


def rows() -> list[Feedback]:
    with storage.transaction() as db:
        found = db.scalars(select(Feedback).order_by(Feedback.created_at)).all()
        db.expunge_all()
        return list(found)


# ---- 送出：身分 ----------------------------------------------------------------------------


def test_anyone_signed_out_can_send_and_their_contact_is_kept(client):
    response = send(client, contact="mei@example.edu")
    assert response.status_code == 201, response.text
    assert response.json()["id"]
    [row] = rows()
    assert row.identity == "anonymous"
    assert row.account_id is None
    assert row.contact == "mei@example.edu"
    assert row.release_id and row.source_sha
    assert row.user_agent


def test_students_and_teachers_are_recorded_and_their_contact_is_dropped(client):
    user(client, "mei", account_role="student")
    assert send(client, contact="ignored").status_code == 201
    user(client, "lin", account_role="teacher")
    assert send(client).status_code == 201
    student, teacher = rows()
    assert (student.identity, student.contact) == ("student", None)
    assert teacher.identity == "teacher"
    assert teacher.account_id is not None


def test_an_unverified_account_can_send_from_the_verify_page(client):
    client.post(
        "/api/v2/auth/register",
        json={
            "username": "newbie",
            "email": "newbie@example.org",
            "password": "Socratic-123456",
            "account_role": "student",
        },
    )
    login = client.post(
        "/api/v2/auth/login", json={"login": "newbie", "password": "Socratic-123456"}
    )
    assert login.status_code == 200, login.text
    client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    assert send(client).status_code == 201
    [row] = rows()
    assert (row.identity, row.account_id) == ("student", login.json()["id"])


def test_a_guest_is_recorded_as_a_guest_and_keeps_the_contact(client):
    _, course = teacher_course(client)
    leave(client)
    joined = guest_join(client, course["code"])
    assert joined.status_code == 200, joined.text
    assert send(client, contact="0912-345-678").status_code == 201
    [row] = rows()
    assert row.identity == "guest"
    assert row.contact == "0912-345-678"
    assert row.account_id == joined.json()["account"]["id"]


def test_an_expired_guest_session_counts_as_signed_out(client):
    _, course = teacher_course(client)
    leave(client)
    joined = guest_join(client, course["code"])
    with storage.transaction() as db:
        db.get(Account, joined.json()["account"]["id"]).guest_expires_at = time.time() - 1
    assert send(client).status_code == 201
    [row] = rows()
    assert (row.identity, row.account_id) == ("anonymous", None)


def test_a_signed_in_session_without_the_right_csrf_token_is_refused(client):
    user(client, "mei")
    client.headers["X-CSRF-Token"] = "wrong"
    response = send(client)
    assert response.status_code == 403
    assert response.json()["detail"] == "SESSION_CSRF_REQUIRED"
    assert rows() == []


def test_another_origin_is_refused(client):
    response = client.post(
        "/api/v2/feedback", json=body(), headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 403


# ---- 送出：內容檢查 ------------------------------------------------------------------------


def test_an_empty_message_is_refused(client):
    response = send(client, message="   \n ")
    assert response.status_code == 422
    assert response.json()["detail"] == "FEEDBACK_MESSAGE_REQUIRED"


def test_long_fields_are_refused(client):
    for field, value in (
        ("message", "字" * 2001),
        ("contact", "a" * 201),
        ("page", "/" + "a" * 500),
    ):
        response = send(client, **{field: value})
        assert response.status_code == 422, field
        assert response.json()["detail"] == "FEEDBACK_TOO_LONG", field
    assert send(client, message="字" * 2000).status_code == 201


def test_unknown_fields_and_bad_shapes_are_refused(client):
    assert send(client, admin=True).status_code == 422
    assert send(client, viewport={"w": 0, "h": 800}).status_code == 422
    assert send(client, kind="bug").status_code == 422
    assert send(client, locale="x" * 17).status_code == 422


def test_the_kind_is_optional(client):
    assert send(client, kind=None).status_code == 201
    assert rows()[0].kind is None


def test_a_page_that_is_not_a_site_path_is_refused(client):
    for page in ("https://evil.example/report", "//evil.example/x", "join", ""):
        assert send(client, page=page).status_code == 422, page
    assert rows() == []


def test_only_the_pathname_is_kept(client):
    assert send(client, page="/join?code=ABC123#top").status_code == 201
    assert rows()[0].page == "/join"


def test_png_jpeg_and_webp_screenshots_are_stored(client):
    for data, mime in ((PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")):
        assert send(client, screenshot=shot(data, mime)).status_code == 201, mime
    stored = rows()
    assert [r.screenshot_mime for r in stored] == ["image/png", "image/jpeg", "image/webp"]
    assert stored[0].screenshot == PNG
    assert stored[0].screenshot_size == len(PNG)


def test_a_screenshot_that_is_not_what_it_claims_is_refused(client):
    bad = [
        shot(GIF, "image/png"),
        shot(PNG, "image/jpeg"),
        {"mime": "image/png", "data_base64": "not base64!!"},
        shot(PNG[:8] + b"\x00" * (750 * 1024), "image/png"),
    ]
    for screenshot in bad:
        response = send(client, screenshot=screenshot)
        assert response.status_code == 422
        assert response.json()["detail"] == "FEEDBACK_SCREENSHOT_INVALID"
    long_mime = send(client, screenshot=shot(PNG, "image/" + "x" * 40))
    assert (long_mime.status_code, long_mime.json()["detail"]) == (
        422,
        "FEEDBACK_SCREENSHOT_INVALID",
    )
    gif = send(client, screenshot=shot(GIF, "image/gif"))
    assert (gif.status_code, gif.json()["detail"]) == (422, "FEEDBACK_SCREENSHOT_INVALID")
    assert rows() == []


def test_a_screenshot_just_under_the_limit_is_stored(client):
    data = PNG[:8] + b"\x00" * (750 * 1024 - 8)
    assert send(client, screenshot=shot(data)).status_code == 201


# ---- 送出：次數上限（P7）------------------------------------------------------------------


def test_an_account_may_send_ten_in_a_window(client):
    user(client, "mei")
    for _ in range(10):
        assert send(client).status_code == 201
    response = send(client)
    assert response.status_code == 429
    assert response.json()["detail"] == "RATE_LIMITED"


def test_signed_out_senders_share_sixty_in_a_window(client):
    for _ in range(60):
        assert send(client).status_code == 201
    assert send(client).status_code == 429


# ---- 讀取：只有平台管理員（後台 spec P11）--------------------------------------------------


def make_admin(username: str) -> None:
    with storage.transaction() as db:
        db.scalar(select(Account).where(Account.username == username)).platform_role = "admin"


def test_an_admin_sees_newest_first_with_who_sent_it(client):
    assert send(client, contact="anon@example.edu", screenshot=shot(PNG)).status_code == 201
    _, course = teacher_course(client)
    leave(client)
    guest = guest_join(client, course["code"]).json()["account"]
    assert send(client, contact="0912").status_code == 201
    leave(client)
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    assert send(client, message="老師的回饋").status_code == 201

    page = client.get("/api/v2/feedback")
    assert page.status_code == 200, page.text
    view = page.json()
    assert (view["page"], view["has_more"]) == (1, False)
    first, second, third = view["items"]
    assert (first["message"], first["identity"], first["account_kind"]) == (
        "老師的回饋",
        "teacher",
        "registered",
    )
    assert first["account_name"] == "fizzy"
    assert (second["identity"], second["account_kind"], second["contact"]) == (
        "guest",
        "guest",
        "0912",
    )
    assert second["account_name"] == guest["username"]
    assert (third["identity"], third["account_kind"], third["account_name"]) == (
        "anonymous",
        None,
        None,
    )
    assert third["has_screenshot"] is True
    assert "screenshot" not in third


def test_an_expired_guest_has_no_name_in_the_list(client):
    _, course = teacher_course(client)
    leave(client)
    guest = guest_join(client, course["code"]).json()["account"]
    assert send(client).status_code == 201
    with storage.transaction() as db:
        row = db.get(Account, guest["id"])
        row.kind = "expired_guest"
    leave(client)
    user(client, "qatester", account_role="student")
    make_admin("qatester")
    [item] = client.get("/api/v2/feedback").json()["items"]
    assert (item["account_kind"], item["account_name"]) == ("expired_guest", None)


def test_pages_hold_fifty(client):
    with storage.transaction() as db:
        for index in range(51):
            db.add(
                Feedback(
                    id=f"id-{index:03d}",
                    created_at=1000.0 + index,
                    message=f"#{index}",
                    page="/",
                    viewport_w=1,
                    viewport_h=1,
                    locale="en",
                    user_agent="",
                    release_id="r",
                    source_sha="s",
                    identity="anonymous",
                )
            )
    user(client, "fizzy")
    make_admin("fizzy")
    first = client.get("/api/v2/feedback?page=1").json()
    assert len(first["items"]) == 50 and first["has_more"] is True
    assert first["items"][0]["message"] == "#50"
    second = client.get("/api/v2/feedback?page=2").json()
    assert [i["message"] for i in second["items"]] == ["#0"] and second["has_more"] is False
    assert client.get("/api/v2/feedback?page=0").status_code == 422


def test_accounts_that_are_not_admins_get_not_found(client):
    assert send(client, screenshot=shot(PNG)).status_code == 201
    [row] = rows()
    user(client, "mei")
    for path in ("/api/v2/feedback", f"/api/v2/feedback/{row.id}/screenshot"):
        response = client.get(path)
        assert response.status_code == 404, path
        assert response.json()["detail"] == "FEEDBACK_NOT_FOUND"


def test_signed_out_people_and_guests_see_nothing_either(client):
    assert send(client, screenshot=shot(PNG)).status_code == 201
    [row] = rows()
    paths = ("/api/v2/feedback", f"/api/v2/feedback/{row.id}/screenshot")
    for path in paths:
        response = client.get(path)
        assert (response.status_code, response.json()["detail"]) == (404, "FEEDBACK_NOT_FOUND")
    _, course = teacher_course(client)
    leave(client)
    guest_join(client, course["code"])
    for path in paths:
        response = client.get(path)
        assert (response.status_code, response.json()["detail"]) == (404, "FEEDBACK_NOT_FOUND")


def test_an_admin_gets_the_screenshot(client):
    assert send(client, screenshot=shot(JPEG, "image/jpeg")).status_code == 201
    assert send(client).status_code == 201
    with_shot, without = rows()
    user(client, "fizzy")
    make_admin("fizzy")
    response = client.get(f"/api/v2/feedback/{with_shot.id}/screenshot")
    assert response.status_code == 200
    assert response.json() == {"mime": "image/jpeg", "data_base64": base64.b64encode(JPEG).decode()}
    assert response.headers["cache-control"] == "private, no-store"
    missing = client.get(f"/api/v2/feedback/{without.id}/screenshot")
    assert missing.status_code == 404
    assert client.get("/api/v2/feedback/nope/screenshot").status_code == 404


# ---- 截圖保存 90 天（P10）------------------------------------------------------------------


def test_screenshots_older_than_ninety_days_are_cleared_and_the_text_stays(client):
    assert send(client, screenshot=shot(PNG)).status_code == 201
    assert send(client, screenshot=shot(PNG)).status_code == 201
    old, recent = rows()
    day = 86400
    with storage.transaction() as db:
        db.get(Feedback, old.id).created_at = time.time() - 91 * day
        db.get(Feedback, recent.id).created_at = time.time() - 89 * day
    with storage.transaction() as db:
        assert feedback_service.purge_screenshots(db, time.time()) == 1
    old_after, recent_after = rows()
    assert old_after.screenshot is None and old_after.screenshot_mime is None
    assert old_after.message == old.message
    assert recent_after.screenshot == PNG


def test_the_app_clears_old_screenshots_once_an_hour(client, monkeypatch):
    from app import classroom_app
    from app.modules.app_shell import llm_workers

    assert llm_workers.FEEDBACK_PURGE_SECONDS == 3600
    assert "feedback_purge_loop" in classroom_app.lifespan.__wrapped__.__code__.co_names
    assert send(client, screenshot=shot(PNG)).status_code == 201
    [row] = rows()
    with storage.transaction() as db:
        db.get(Feedback, row.id).created_at = time.time() - 91 * 86400
    assert llm_workers.purge_feedback_screenshots() == 1
    assert rows()[0].screenshot is None

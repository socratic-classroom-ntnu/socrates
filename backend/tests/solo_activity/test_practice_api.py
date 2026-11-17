"""學生「我的對話」的 API（spec §10 M10–M16）：從題庫開對話、列表、每日上限、身分阻擋。"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.modules.ai_providers import service as ai_service
from app.modules.app_shell import practice_startup
from app.modules.course_management import practice as course_practice
from app.modules.course_management.repositories import Activity, Course, Enrollment
from app.modules.platform import storage
from app.modules.solo_activity import service as solo_service
from app.modules.solo_activity.repositories import SoloAttempt
from tests.course_management.conftest import user

KEY = {
    "SOCRATES_PRACTICE_LLM_API_KEY": "sk-or-v1-platform-key-0001",
    "SOCRATES_PRACTICE_LLM_MODEL": "m",
}
# 2026-11-15 15:00 UTC＝台北 23:00；16:30 UTC＝台北隔天 00:30，但 UTC 仍是同一天
TAIPEI_LATE = datetime(2026, 11, 15, 15, 0, tzinfo=timezone.utc).timestamp()
TAIPEI_NEXT_DAY = datetime(2026, 11, 15, 16, 30, tzinfo=timezone.utc).timestamp()


def prepare(config=KEY):
    cfg = ai_service.platform_profile_config(config) if config else None
    with storage.transaction() as db:
        practice_startup.prepare_practice(db, cfg)


@pytest.fixture
def at(monkeypatch):
    clock = {"now": TAIPEI_LATE}
    monkeypatch.setattr(solo_service, "now", lambda: clock["now"])
    return clock


@pytest.fixture
def student(client):
    prepare()
    return user(client, "ming")


def start(client, topic="trolley"):
    return client.post("/api/v2/solo/practice", json={"bank_item_id": topic})


def listing(client):
    r = client.get("/api/v2/solo/practice")
    assert r.status_code == 200, r.text
    return r.json()


def count(model):
    with storage.transaction() as db:
        return db.scalar(select(func.count()).select_from(model))


# ---- 題庫 ----


def test_anyone_signed_in_may_read_the_bank_even_a_guest(client):
    r = client.post("/api/v2/auth/guest", json={"nickname": "海獺", "locale": "zh-Hant"})
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    bank = client.get("/api/v2/solo/practice/bank")
    assert bank.status_code == 200, bank.text
    assert [t["id"] for t in bank.json()][:2] == ["llm-school", "trolley"]
    assert set(bank.json()[0]) == {"id", "title", "body", "category", "recommended"}


# ---- 開對話 ----


def test_starting_builds_a_private_course_an_open_activity_and_an_attempt(client, student, at):
    r = start(client)
    assert r.status_code == 201, r.text
    started = r.json()
    with storage.transaction() as db:
        activity = db.get(Activity, started["activity_id"])
        course = db.get(Course, activity.course_id)
        owner = course_practice.practice_owner(db)
        assert (course.owner_id, course.practice_account_id, course.code_enabled) == (
            owner.id,
            student["id"],
            False,
        )
        assert (course.name, course.teacher_name) == ("我的對話", "蘇格拉底")
        enrollment = db.scalar(select(Enrollment).where(Enrollment.course_id == course.id))
        assert (enrollment.account_id, enrollment.display_name) == (student["id"], "ming")
        assert activity.bank_item_id == "trolley"
        assert activity.title.startswith("一輛失控的電車")
        assert (activity.starts_at, activity.ends_at, activity.created_at) == (
            TAIPEI_LATE,
            4102444800,
            TAIPEI_LATE,
        )
        attempt = db.get(SoloAttempt, started["attempt_id"])
        assert (attempt.activity_id, attempt.account_id) == (activity.id, student["id"])


def test_the_same_topic_can_be_started_again_in_the_same_private_course(client, student, at):
    first, second = start(client).json(), start(client).json()
    assert first["activity_id"] != second["activity_id"]
    assert count(Course) == 1
    assert count(Activity) == 2


def test_an_unknown_topic_is_not_found(client, student, at):
    r = start(client, "no-such-topic")
    assert (r.status_code, r.json()) == (404, {"detail": "PRACTICE_TOPIC_NOT_FOUND"})


@pytest.mark.parametrize("body", [{}, {"bank_item_id": ""}, {"bank_item_id": 3}, {"x": "trolley"}])
def test_a_malformed_start_is_rejected(client, student, body):
    assert client.post("/api/v2/solo/practice", json=body).status_code == 422


def test_without_a_platform_connection_nothing_is_created_or_counted(client, at):
    prepare(None)
    user(client, "ming")
    r = start(client)
    assert (r.status_code, r.json()) == (503, {"detail": "PRACTICE_UNAVAILABLE"})
    assert count(Activity) == 0
    assert listing(client)["quota"] == {"limit": 5, "used_today": 0, "remaining": 5}


# ---- 每日上限（台北時間的一天） ----


def test_five_new_dialogues_a_day_then_429(client, student, at):
    for _ in range(5):
        assert start(client).status_code == 201
    r = start(client)
    assert (r.status_code, r.json()) == (429, {"detail": "PRACTICE_DAILY_LIMIT"})
    assert listing(client)["quota"] == {"limit": 5, "used_today": 5, "remaining": 0}
    assert count(Activity) == 5


def test_the_day_turns_at_taipei_midnight_not_utc(client, student, at):
    for _ in range(5):
        start(client)
    at["now"] = TAIPEI_NEXT_DAY
    assert start(client).status_code == 201
    assert listing(client)["quota"]["used_today"] == 1


def test_the_limit_can_be_changed(client, student, at, monkeypatch):
    monkeypatch.setenv("SOCRATES_PRACTICE_DAILY_LIMIT", "2")
    assert start(client).status_code == 201
    assert start(client).status_code == 201
    assert start(client).status_code == 429


def test_an_open_dialogue_keeps_going_after_the_limit(client, student, at):
    started = [start(client).json() for _ in range(5)]
    view = client.get(f"/api/v2/solo/attempts/{started[0]['attempt_id']}")
    assert view.status_code == 200
    assert "send_message" in view.json()["available_actions"]


def test_the_daily_count_runs_after_locking_the_private_course(client, student, at):
    """SQLite 不認 FOR UPDATE，並行也測不出來；改成守住「先鎖私人課程那一列、再數今天的對話」的順序（M11）。"""
    start(client)
    seen = []

    def record(state):
        statement = state.statement
        if not state.is_select:
            return
        tables = {t.name for t in statement.get_final_froms()}
        if "courses" in tables and statement._for_update_arg is not None:
            seen.append("lock")
        elif "activities" in tables and "count" in str(statement).lower():
            seen.append("count")

    event.listen(Session, "do_orm_execute", record)
    try:
        assert start(client).status_code == 201
    finally:
        event.remove(Session, "do_orm_execute", record)
    assert "lock" in seen
    assert seen.index("lock") < seen.index("count")


def test_two_first_requests_racing_leave_one_private_course(client, student, at, monkeypatch):
    start(client)
    lookup = course_practice.practice_course
    calls = {"n": 0}

    def miss_once(db, account_id):
        calls["n"] += 1
        return None if calls["n"] == 1 else lookup(db, account_id)

    monkeypatch.setattr(course_practice, "practice_course", miss_once)
    assert start(client).status_code == 201
    assert count(Course) == 1


def test_a_code_collision_while_creating_the_private_course_retries(
    client, student, at, monkeypatch
):
    user(client, "owner", account_role="teacher")
    taken = client.post("/api/v2/courses", json={"name": "科技倫理", "teacher_name": "王"}).json()[
        "code"
    ]
    codes = iter([taken, "ZZZZ2345"])
    monkeypatch.setattr(course_practice, "new_code", lambda: next(codes))
    client.post("/api/v2/auth/login", json={"login": "ming", "password": "Socratic-123456"})
    client.headers["X-CSRF-Token"] = client.get("/api/v2/auth/me").json()["csrf_token"]
    assert start(client).status_code == 201


def test_five_code_collisions_give_up(client, student, at, monkeypatch):
    user(client, "owner", account_role="teacher")
    taken = client.post("/api/v2/courses", json={"name": "科技倫理", "teacher_name": "王"}).json()[
        "code"
    ]
    monkeypatch.setattr(course_practice, "new_code", lambda: taken)
    client.post("/api/v2/auth/login", json={"login": "ming", "password": "Socratic-123456"})
    client.headers["X-CSRF-Token"] = client.get("/api/v2/auth/me").json()["csrf_token"]
    r = start(client)
    assert (r.status_code, r.json()) == (503, {"detail": "COURSE_CODE_EXHAUSTED"})


# ---- 列表 ----


def test_the_list_resolves_titles_and_puts_the_latest_answered_first(client, student, at):
    older = start(client, "trolley").json()
    at["now"] = TAIPEI_LATE + 60
    newer = start(client, "ship-of-theseus").json()
    # 回到較舊的那段繼續作答：它的作答更新時間變新，排到最前（直接改時間，不呼叫 LLM）
    with storage.transaction() as db:
        newest = db.scalar(select(func.max(SoloAttempt.updated_at)))
        db.get(SoloAttempt, older["attempt_id"]).updated_at = newest + 10
    rows = listing(client)["dialogues"]
    assert [r["activity_id"] for r in rows] == [older["activity_id"], newer["activity_id"]]
    first = rows[0]
    assert (first["topic_id"], first["title"], first["category"], first["status"]) == (
        "trolley",
        "電車難題",
        "life",
        "in_progress",
    )
    assert first["body"].startswith("一輛失控的電車")
    assert first["attempt_id"] == older["attempt_id"]
    assert first["created_at"] == TAIPEI_LATE


def test_only_a_completed_attempt_counts_as_completed(client, student, at):
    started = start(client).json()
    with storage.transaction() as db:
        db.get(SoloAttempt, started["attempt_id"]).state = "reviewing"
    assert listing(client)["dialogues"][0]["status"] == "in_progress"
    with storage.transaction() as db:
        db.get(SoloAttempt, started["attempt_id"]).state = "completed"
    assert listing(client)["dialogues"][0]["status"] == "completed"


def test_a_removed_topic_still_lists_with_a_fallback_title(client, student, at, monkeypatch):
    start(client, "trolley")
    monkeypatch.setattr(
        course_practice, "_bank", tuple(i for i in course_practice.bank() if i.id != "trolley")
    )
    (row,) = listing(client)["dialogues"]
    assert row["category"] is None
    assert row["body"].startswith("一輛失控的電車")
    assert row["title"] == row["body"][:20] + "…"


def test_editing_a_topic_does_not_rewrite_what_was_discussed(client, student, at, monkeypatch):
    start(client, "trolley")
    edited = tuple(
        i.model_copy(update={"body": "改寫過的情境"}) if i.id == "trolley" else i
        for i in course_practice.bank()
    )
    monkeypatch.setattr(course_practice, "_bank", edited)
    (row,) = listing(client)["dialogues"]
    assert row["body"].startswith("一輛失控的電車")
    assert row["title"] == "電車難題"


def test_display_title_cuts_at_twenty_characters():
    assert course_practice.display_title(None, "字" * 20) == "字" * 20
    assert course_practice.display_title(None, "字" * 21) == "字" * 20 + "…"


# ---- 誰能用 ----


def test_a_guest_cannot_list_or_start(client, at):
    prepare()
    r = client.post("/api/v2/auth/guest", json={"nickname": "海獺", "locale": "zh-Hant"})
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    for response in (client.get("/api/v2/solo/practice"), start(client)):
        assert (response.status_code, response.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})
    assert count(Course) == 0


def test_a_teacher_account_cannot_list_or_start(client, at):
    prepare()
    user(client, "owner", account_role="teacher")
    for response in (client.get("/api/v2/solo/practice"), start(client)):
        assert (response.status_code, response.json()) == (
            403,
            {"detail": "ACCOUNT_ROLE_FORBIDDEN"},
        )


# ---- 作答頁看到的名稱與 practice 旗標（M16） ----


def test_the_activity_and_attempt_views_show_the_short_title(client, student, at):
    started = start(client).json()
    view = client.get(f"/api/v2/solo/activities/{started['activity_id']}").json()
    assert (view["title"], view["practice"]) == ("電車難題", True)
    attempt = client.get(f"/api/v2/solo/attempts/{started['attempt_id']}").json()
    assert attempt["activity_title"] == "電車難題"

"""移出課程與「開始活動」同時發生時，不會留下沒有選課紀錄的作答（spec〈架構與契約〉）。

移出先用 SELECT … FOR UPDATE 鎖住選課紀錄；solo-activity 的 start 也先以共享鎖讀同一列，再建立
attempt。SQLite 沒有列鎖，所以這裡沿用 invariants 的 postgres_client：真的 Postgres、兩條連線、
各自一個交易。兩個方向都驗：誰先拿到鎖，另一邊就等它 commit；拿掉任一邊的鎖，就會留下孤兒 attempt。
"""

import threading
import time
from collections.abc import Callable

from sqlalchemy import func, select

from app.modules.course_management import enrollment as enrollment_service
from app.modules.course_management.repositories import Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import service
from app.modules.solo_activity.contracts import SendMessageBody
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.invariants.test_solo_attempt_row_lock import postgres_client  # noqa: F401
from tests.solo_activity.test_solo_attempts_api import ok, setup, start


def student_attempts(account_id: str) -> int:
    with storage.transaction() as db:
        return db.scalar(
            select(func.count())
            .select_from(SoloAttempt)
            .where(SoloAttempt.account_id == account_id)
        )


def enrollment_id_of(account_id: str, course_id: str) -> str:
    with storage.transaction() as db:
        found = db.scalar(
            select(Enrollment.id).where(
                Enrollment.account_id == account_id, Enrollment.course_id == course_id
            )
        )
        assert found is not None
        return found


def removing(course_id: str, enrollment_id: str) -> Callable:
    def run(db) -> str:
        enrollment_service.remove_student(db, db.get(Course, course_id), enrollment_id)
        return "removed"

    return run


def starting(student_id: str, activity_id: str) -> Callable:
    def run(db) -> str:
        try:
            service.start(db, db.get(Account, student_id), activity_id, service.now())
            return "started"
        except DomainError as error:
            return error.code

    return run


def race(first: Callable, second: Callable) -> list[str]:
    """first runs and holds its transaction open; second starts and must wait; then first commits."""
    order: list[str] = []
    errors: list[BaseException] = []
    first_holds = threading.Event()
    release_first = threading.Event()

    def run(work: Callable, name: str, hold: bool) -> None:
        try:
            with storage.transaction() as db:
                order.append(f"{name}:{work(db)}")
                if hold:
                    first_holds.set()
                    release_first.wait(timeout=10)
        except BaseException as exc:  # noqa: BLE001 - surface background-thread failures
            errors.append(exc)
            first_holds.set()

    a = threading.Thread(target=run, args=(first, "first", True), daemon=True)
    b = threading.Thread(target=run, args=(second, "second", False), daemon=True)
    a.start()
    try:
        assert first_holds.wait(timeout=5), "第一條線應該要能拿到鎖"
        assert not errors, f"第一條線出錯：{errors}"
        b.start()
        time.sleep(0.5)
        assert len(order) == 1, f"第二條線不該在第一條線 commit 前完成：{order}"
    finally:
        release_first.set()
    a.join(timeout=5)
    b.join(timeout=5)
    assert not a.is_alive() and not b.is_alive(), "執行緒逾時未結束"
    assert not errors, f"背景執行緒出錯：{errors}"
    return order


def test_a_start_waits_for_a_removal_and_then_finds_no_enrollment(postgres_client):  # noqa: F811
    s = setup(postgres_client)
    course_id = s["course"]["id"]
    student_id = s["student"]["id"]
    target = enrollment_id_of(student_id, course_id)

    order = race(removing(course_id, target), starting(student_id, s["activity_id"]))

    assert order == ["first:removed", "second:ACTIVITY_NOT_FOUND"], order
    assert student_attempts(student_id) == 0


def test_a_removal_waits_for_a_start_and_then_removes_its_attempt(postgres_client):  # noqa: F811
    s = setup(postgres_client)
    course_id = s["course"]["id"]
    student_id = s["student"]["id"]
    target = enrollment_id_of(student_id, course_id)

    order = race(starting(student_id, s["activity_id"]), removing(course_id, target))

    assert order == ["first:started", "second:removed"], order
    assert student_attempts(student_id) == 0


def sending(student_id: str, attempt_id: str) -> Callable:
    def run(db) -> str:
        account = db.get(Account, student_id)
        body = SendMessageBody(text="移出前一刻送出的理由")
        service.begin_action(db, account, attempt_id, "send_message", body, service.now())
        return "sent"

    return run


def test_a_removal_waits_for_a_message_being_saved_and_then_removes_it(postgres_client):  # noqa: F811
    """The hook locks the attempts before deleting messages: a message saved at the same moment is
    committed first and then deleted with its attempt, never left behind (or breaking the delete)."""
    s = setup(postgres_client)
    course_id = s["course"]["id"]
    student_id = s["student"]["id"]
    attempt_id = ok(start(postgres_client, s["activity_id"]))["id"]
    target = enrollment_id_of(student_id, course_id)

    order = race(sending(student_id, attempt_id), removing(course_id, target))

    assert order == ["first:sent", "second:removed"], order
    assert student_attempts(student_id) == 0
    with storage.transaction() as db:
        left = db.scalar(
            select(func.count())
            .select_from(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id)
        )
    assert left == 0

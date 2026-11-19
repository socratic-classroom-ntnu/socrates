"""系統 AI 的寫入由系統帳號的列鎖序列化（spec P30、P37）。

兩條真的 Postgres 連線：啟動匯入（A）拿到鎖、確認沒有連線後先不寫；後台儲存（B）必須等。
A 寫入部署設定並提交後，B 才拿到鎖，發現設定在它測試之後被改過 → 409，資料庫保留 A 的。
把 lock_practice_owner 的 FOR NO KEY UPDATE 拿掉，B 會在 A 提交前就比對通過、寫入，這個測試就紅。
"""

import threading
import time

from sqlalchemy import select, text

from app.modules.admin import system_ai
from app.modules.ai_providers import service as ai_service
from app.modules.ai_providers.repositories import ProviderProfile
from app.modules.app_shell import practice_startup
from app.modules.course_management import service as course_service
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from tests.invariants.test_solo_attempt_row_lock import postgres_client  # noqa: F401


def blocked_by(pid: int | None) -> bool:
    """Some connection to this database is waiting on the one holding A's transaction."""
    if pid is None:
        return False
    with storage.transaction() as db:
        query = text(
            "SELECT count(*) FROM pg_stat_activity"
            " WHERE datname = current_database() AND :pid = ANY(pg_blocking_pids(pid))"
        )
        return bool(db.scalar(query, {"pid": pid}))


DEPLOY = ai_service.PlatformConfig("openrouter", "deploy-model", "sk-or-v1-env-0001", None)
ADMIN = ai_service.PlatformConfig("openrouter", "admin-model", "sk-or-v1-admin-0002", None)


def test_a_save_waits_for_the_startup_import_and_then_refuses(postgres_client, monkeypatch):  # noqa: F811
    with storage.transaction() as db:
        course_service.practice_owner(db)
    with storage.transaction() as db:
        snapshot = system_ai.snapshot(db)  # B tested before anything was saved
    assert snapshot is None

    a_holds, release_a = threading.Event(), threading.Event()
    order: list[str] = []
    errors: list[BaseException] = []
    real_save = ai_service.save_platform_profile

    a_pid: list[int] = []

    def paused_for_a(db, owner_id, config, by):
        if threading.current_thread().name == "A":
            a_pid.append(db.scalar(text("SELECT pg_backend_pid()")))
            a_holds.set()
            release_a.wait(timeout=10)
        real_save(db, owner_id, config, by)

    monkeypatch.setattr(ai_service, "save_platform_profile", paused_for_a)

    def startup():
        try:
            with storage.transaction() as db:
                practice_startup.import_env(db, DEPLOY)
            order.append("A_imported")
        except BaseException as exc:  # noqa: BLE001 - surface background-thread failures
            errors.append(exc)
            a_holds.set()

    def admin_save():
        try:
            with storage.transaction() as db:
                try:
                    system_ai.save(db, ADMIN, "admin-id", snapshot)
                    order.append("B_saved")
                except DomainError as error:
                    order.append(f"B_{error.code}")
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    a = threading.Thread(target=startup, name="A", daemon=True)
    b = threading.Thread(target=admin_save, name="B", daemon=True)
    a.start()
    try:
        assert a_holds.wait(timeout=5), "啟動匯入應該要拿到鎖"
        assert not errors, errors
        b.start()
        # Proof that B really waits on A's row lock, not a guess with sleep: Postgres lists a
        # backend blocked by A's own connection. Without the lock B finishes on its own first.
        deadline = time.monotonic() + 5
        while (
            time.monotonic() < deadline
            and not order
            and not blocked_by(a_pid[0] if a_pid else None)
        ):
            time.sleep(0.02)
        assert order == [], "後台儲存不該在啟動匯入提交前就寫入"
        assert blocked_by(a_pid[0]), "後台儲存應該正在等啟動匯入那條連線的鎖"
    finally:
        release_a.set()
    a.join(timeout=5)
    b.join(timeout=5)
    assert not errors, errors
    assert order == ["A_imported", "B_SYSTEM_AI_CHANGED"]
    with storage.transaction() as db:
        (row,) = db.scalars(select(ProviderProfile)).all()
        assert row.default_model == "deploy-model"


def test_a_startup_after_a_save_writes_nothing(postgres_client):  # noqa: F811
    with storage.transaction() as db:
        system_ai.save(db, ADMIN, "admin-id", system_ai.snapshot(db))
    with storage.transaction() as db:
        practice_startup.import_env(db, DEPLOY)
    with storage.transaction() as db:
        (row,) = db.scalars(select(ProviderProfile)).all()
        assert row.default_model == "admin-model"

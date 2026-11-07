"""學生連點兩下不會產生兩條分岔的對話：同一個 attempt 的動作由 Postgres 列鎖序列化。

solo_activity/service.py 的 _locked_attempt 用 SELECT … FOR UPDATE 鎖住 attempt 列，每個動作的
Tx1 都從這裡開始。SQLite 沒有列鎖，所以這裡用真的 Postgres、兩條獨立連線、各自一個交易：
第一條線拿到鎖後先不 commit，確認第二條線的同一個動作「還沒」拿到鎖；第一條線 commit 後，
第二條線才拿到鎖，而且看到的是第一條線寫下的狀態——它的 submit_stance 已不在 available_actions
裡，被拒絕，不會再存一則學生訊息。這個順序本身就是證據；把 .with_for_update() 拿掉，
第二條線會立刻拿到舊狀態、也送出立場，這個測試就會失敗。
"""

import os
import threading
import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.classroom_app import create_app
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import service
from app.modules.solo_activity.contracts import SubmitStanceBody
from app.modules.solo_activity.repositories import SoloMessage
from tests.solo_activity.test_solo_attempts_api import ok, setup, start


@pytest.fixture
def postgres_client(monkeypatch):
    """The app on its own Postgres schema, so two connections really contend for one row."""
    url = make_url(os.environ["DATABASE_URL"])
    assert url.database.endswith("_test")
    schema = "solo_lock_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url.update_query_dict({"options": f"-csearch_path={schema}"}))
    monkeypatch.setattr(storage, "_ENGINE", engine)
    monkeypatch.setattr(storage, "_FACTORY", sessionmaker(engine, expire_on_commit=False))
    try:
        storage.Base.metadata.create_all(engine)
        with TestClient(create_app(background=False)) as client:
            yield client
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def student_messages(attempt_id: str) -> int:
    with storage.transaction() as db:
        return db.scalar(
            select(func.count())
            .select_from(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id, SoloMessage.role == "student")
        )


def test_a_second_action_waits_for_the_first_to_commit(postgres_client):
    s = setup(postgres_client)
    attempt_id = ok(start(postgres_client, s["activity_id"]))["id"]
    student_id = s["student"]["id"]

    order: list[str] = []
    errors: list[BaseException] = []
    first_holds_lock = threading.Event()
    release_first = threading.Event()

    def act(name: str, hold: bool) -> None:
        try:
            with storage.transaction() as db:
                account = db.get(Account, student_id)
                body = SubmitStanceBody(option_id="o1", reason=f"{name} 的理由")
                try:
                    service.begin_action(
                        db, account, attempt_id, "submit_stance", body, service.now()
                    )
                    order.append(f"{name}_acted")
                except DomainError as error:
                    order.append(f"{name}_{error.code}")
                if hold:
                    first_holds_lock.set()
                    release_first.wait(timeout=10)
                # Leaving the block commits; only then does Postgres release the row lock.
        except BaseException as exc:  # noqa: BLE001 - surface background-thread failures
            errors.append(exc)
            first_holds_lock.set()

    first = threading.Thread(target=act, args=("A", True), daemon=True)
    first.start()
    second = threading.Thread(target=act, args=("B", False), daemon=True)
    try:
        assert first_holds_lock.wait(timeout=5), "第一條線應該要能拿到列鎖"
        assert not errors, f"第一條線在拿鎖階段就出錯了：{errors}"
        second.start()
        # A fake lock would let the second connection through at once.
        time.sleep(0.5)
        assert order == ["A_acted"], "第二個連線不該在第一個連線 commit 前就拿到列鎖"
    finally:
        release_first.set()

    first.join(timeout=5)
    second.join(timeout=5)
    assert not first.is_alive(), "第一條線逾時未結束"
    assert not second.is_alive(), "第二條線逾時未結束"
    assert not errors, f"背景執行緒出錯：{errors}"
    assert order == ["A_acted", "B_SOLO_ACTION_UNAVAILABLE"], order
    assert student_messages(attempt_id) == 1

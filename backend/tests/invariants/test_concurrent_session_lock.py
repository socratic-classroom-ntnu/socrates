import threading
import time
import uuid

from app.db import SessionLocal
from app.models import Learner, Session
from app.repositories.session_repository import SessionRepository


def test_get_for_update_blocks_a_second_real_connection():
    """證明 SessionRepository.get_for_update 的列鎖真的會序列化兩個獨立連線。

    這個套件裡其餘所有「並發」測試模擬的對手都是在同一個 SQLAlchemy session
    裡手動改記憶體中的物件，從來沒有真的讓兩條資料庫連線去搶同一列的鎖。
    Mutation testing 證實了這個盲點：把 get_for_update()（session_repository.py）
    裡的 .with_for_update() 整段刪掉，其餘測試（115 passed、3 xfailed）照樣
    全線綠燈——沒有任何一個測試會因為鎖消失而失敗。這條鎖存在的唯一理由是
    「學生連點兩下不會產生兩條分岔的對話」（設計規格，session_repository.py
    的 docstring），如果它不是真的鎖住 Postgres 的列，這個保證就是假的。

    做法：像 conftest 的 exploding_service fixture 一樣，用兩個獨立的
    SessionLocal() 連線各自開一個真的交易——而不是用會把整個測試包進單一
    連線 savepoint、對第二個連線完全不可見的 db fixture。第一個連線先拿到
    列鎖並用 threading.Event 訊號通知；主執行緒睡一小段時間後確認第二個
    連線「還沒」拿到鎖，這時才釋放第一個連線（commit），最後確認第二個
    連線隨後真的拿到了鎖。這個順序本身就是證據，不是「兩邊最後都跑完了」
    這種弱斷言。
    """
    learner_id = uuid.uuid4()
    session_id = uuid.uuid4()
    with SessionLocal() as setup_db:
        setup_db.add(Learner(id=learner_id))
        setup_db.add(
            Session(
                id=session_id,
                learner_id=learner_id,
                ladder_id="trolley",
                ladder_version=1,
                status="active",
                flow_state="active_in_stage",
                current_stage_index=0,
                extra_turns_used=0,
            )
        )
        setup_db.commit()

    order: list[str] = []
    errors: list[BaseException] = []
    lock_held = threading.Event()
    release_lock = threading.Event()

    def hold_lock() -> None:
        try:
            with SessionLocal() as db:
                SessionRepository(db).get_for_update(session_id)
                order.append("A_acquired")
                lock_held.set()
                release_lock.wait(timeout=10)
                db.commit()  # 只有在這裡，Postgres 才真的釋放這一列的鎖
        except BaseException as exc:  # noqa: BLE001 - 讓背景執行緒的例外能在主執行緒現形
            errors.append(exc)
            lock_held.set()  # 避免主執行緒因為等不到訊號而卡死

    def acquire_second() -> None:
        try:
            with SessionLocal() as db:
                SessionRepository(db).get_for_update(session_id)  # 預期在這裡被卡住
                order.append("B_acquired")
                db.commit()
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    # daemon=True 是保險：就算下面的斷言中途失敗，也不會讓還卡在
    # release_lock.wait(timeout=10) 的背景執行緒拖著整個 pytest process 十秒才退出。
    holder = threading.Thread(target=hold_lock, daemon=True)
    holder.start()
    try:
        assert lock_held.wait(timeout=5), "第一條線應該要能拿到列鎖"
        assert not errors, f"第一條線在拿鎖階段就出錯了：{errors}"

        acquirer = threading.Thread(target=acquire_second, daemon=True)
        acquirer.start()

        # 給第二條線足夠時間嘗試拿鎖——如果鎖是假的（例如 .with_for_update() 被拿掉），
        # 它會立刻拿到，下面這個斷言就會失敗。
        time.sleep(0.5)
        assert "B_acquired" not in order, "第二個連線不該在第一個連線 commit 前就拿到列鎖"
    finally:
        release_lock.set()

    holder.join(timeout=5)
    acquirer.join(timeout=5)

    assert not holder.is_alive(), "第一條線逾時未結束"
    assert not acquirer.is_alive(), "第二條線逾時未結束——代表它真的被列鎖卡住了"
    assert not errors, f"背景執行緒出錯：{errors}"
    assert order == ["A_acquired", "B_acquired"], order

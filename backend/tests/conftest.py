"""測試專用的資料庫隔離。

**這個區塊必須留在所有 `app.*` import 之前。** `app/db.py` 的 engine 是在 import
時就建立的，所以只有在那之前改寫 `DATABASE_URL`，測試才會連到自己的資料庫。

沒有這層隔離時，`_create_schema` 的 `drop_all` 會把開發用資料庫的表整個刪掉，
而 `alembic_version` 不在 `Base.metadata` 裡、不會被一起刪——於是重啟容器時
alembic 認為 migration 已套用而跳過，app 從此起不來。這個組合實際發生過。
"""

import os
import uuid
from urllib.parse import urlsplit, urlunsplit

import pytest
from sqlalchemy import create_engine, text


def _to_test_database_url(url: str) -> str:
    parts = urlsplit(url)
    name = parts.path.lstrip("/")
    if name.endswith("_test"):
        return url
    return urlunsplit(parts._replace(path=f"/{name}_test"))


def _ensure_test_database(url: str) -> None:
    parts = urlsplit(url)
    admin_url = urlunsplit(parts._replace(path="/postgres"))
    name = parts.path.lstrip("/")
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            exists = conn.execute(
                text("select 1 from pg_database where datname = :name"), {"name": name}
            ).scalar()
            if not exists:
                conn.execute(text(f'create database "{name}"'))
    finally:
        admin.dispose()


_DEFAULT_URL = "postgresql+psycopg://socrates:socrates@localhost:5432/socrates"
_TEST_URL = _to_test_database_url(os.environ.get("DATABASE_URL", _DEFAULT_URL))

# 機械守衛：規則只能降低犯錯率，擋得住的只有會當場失敗的檢查。
# 有人（或某個 AI）日後把上面改成指回開發資料庫時，第一次跑測試就會被擋下來，
# 而不是等資料沒了才發現。
if not urlsplit(_TEST_URL).path.endswith("_test"):
    raise RuntimeError(f"測試只能對 *_test 資料庫執行，目前是 {_TEST_URL}")

os.environ["DATABASE_URL"] = _TEST_URL
_ensure_test_database(_TEST_URL)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session as OrmSession  # noqa: E402

from app.api.deps import get_db  # noqa: E402
from app.api.deps import get_service  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.conversation import ConversationService  # noqa: E402
from app.tutor.gateway import TutorGateway  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    assert str(engine.url).endswith("_test"), f"engine 指向非測試資料庫：{engine.url}"
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = OrmSession(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def learner_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def two_stage_app(monkeypatch):
    """Use two stages so future stage titles can actually leak in an API response."""
    from tests.orchestrator.conftest import make_ladder
    import app.main as main

    monkeypatch.setattr(main, "ladder_repository", make_ladder(stage_count=2))
    yield


class ExplodingProvider:
    def generate(self, request):
        raise RuntimeError("provider 掛了")


@pytest.fixture
def exploding_service():
    import app.main as main

    def _override():
        # Each request gets its own transaction, so a later GET proves that the
        # student message was committed before the provider failed.
        with SessionLocal() as service_db:
            yield ConversationService(
                service_db, main.ladder_repository, TutorGateway(ExplodingProvider())
            )

    app.dependency_overrides[get_service] = _override
    yield
    app.dependency_overrides.pop(get_service, None)

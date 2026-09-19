import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as OrmSession

from app.api.deps import get_db
from app.api.deps import get_service
from app.db import Base, SessionLocal, engine
from app.main import app
from app.services.conversation import ConversationService
from app.tutor.gateway import TutorGateway


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
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

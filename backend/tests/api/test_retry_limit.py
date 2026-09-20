import app.main as main
from app.api.deps import get_service
from app.db import SessionLocal
from app.main import app
from app.services.conversation import ConversationService
from app.tutor.gateway import TutorGateway


def test_retry_limit_preserves_student_message(client, learner_id, exploding_service):
    headers = {"X-Learner-Id": learner_id}
    sid = client.post("/api/sessions", json={"ladder_id": "trolley"}, headers=headers).json()[
        "session"
    ]["id"]
    assert (
        client.post(
            f"/api/sessions/{sid}/messages",
            json={"text": "我想了很久的理由"},
            headers=headers,
        ).status_code
        == 503
    )
    for _ in range(3):
        assert client.post(f"/api/sessions/{sid}/retry", headers=headers).status_code == 503
        detail = client.get(f"/api/sessions/{sid}", headers=headers).json()
        assert detail["messages"][-1]["content"] == "我想了很久的理由"
    assert detail["available_actions"] == ["end"]
    assert client.post(f"/api/sessions/{sid}/retry", headers=headers).status_code == 409
    assert client.post(f"/api/sessions/{sid}/end", headers=headers).status_code == 200
    ended = client.get(f"/api/sessions/{sid}", headers=headers).json()
    assert ended["messages"][-1]["content"] == "我想了很久的理由"


class CountingFailure:
    def __init__(self):
        self.calls = 0

    def generate(self, request):
        self.calls += 1
        raise RuntimeError("provider 掛了")


def test_fourth_retry_does_not_call_provider(client, learner_id):
    provider = CountingFailure()

    def override():
        with SessionLocal() as service_db:
            yield ConversationService(service_db, main.ladder_repository, TutorGateway(provider))

    app.dependency_overrides[get_service] = override
    try:
        headers = {"X-Learner-Id": learner_id}
        sid = client.post("/api/sessions", json={"ladder_id": "trolley"}, headers=headers).json()[
            "session"
        ]["id"]
        assert (
            client.post(
                f"/api/sessions/{sid}/messages", json={"text": "理由"}, headers=headers
            ).status_code
            == 503
        )
        for _ in range(3):
            assert client.post(f"/api/sessions/{sid}/retry", headers=headers).status_code == 503
        before = provider.calls
        assert client.post(f"/api/sessions/{sid}/retry", headers=headers).status_code == 409
        assert provider.calls == before
    finally:
        app.dependency_overrides.pop(get_service, None)


def test_successful_retry_adds_exactly_one_tutor_message(client, learner_id, exploding_service):
    headers = {"X-Learner-Id": learner_id}
    sid = client.post("/api/sessions", json={"ladder_id": "trolley"}, headers=headers).json()[
        "session"
    ]["id"]
    assert (
        client.post(
            f"/api/sessions/{sid}/messages", json={"text": "理由"}, headers=headers
        ).status_code
        == 503
    )
    before = client.get(f"/api/sessions/{sid}", headers=headers).json()["messages"]
    app.dependency_overrides.pop(get_service, None)
    assert client.post(f"/api/sessions/{sid}/retry", headers=headers).status_code == 200
    assert client.post(f"/api/sessions/{sid}/retry", headers=headers).status_code == 409
    after = client.get(f"/api/sessions/{sid}", headers=headers).json()["messages"]
    assert len(after) == len(before) + 1
    assert after[-1]["role"] == "tutor"

import app.main as main
from app.api.deps import get_service
from app.main import app
from app.services.conversation import ConversationService
from tests.orchestrator.conftest import FakeGateway, obs


def test_advance_opens_once(client, db, learner_id, two_stage_app):
    gateway = FakeGateway([obs(reason_tested=False), obs()])
    app.dependency_overrides[get_service] = lambda: ConversationService(
        db, main.ladder_repository, gateway
    )
    headers = {"X-Learner-Id": learner_id}
    sid = client.post("/api/sessions", json={"ladder_id": "fixture"}, headers=headers).json()[
        "session"
    ]["id"]

    assert client.post(f"/api/sessions/{sid}/advance", headers=headers).status_code == 409
    stranger = {"X-Learner-Id": "00000000-0000-4000-8000-000000000001"}
    assert client.post(f"/api/sessions/{sid}/advance", headers=stranger).status_code == 403

    for text in ("選擇", "理由"):
        assert (
            client.post(
                f"/api/sessions/{sid}/messages", json={"text": text}, headers=headers
            ).status_code
            == 200
        )
    crossroad = client.get(f"/api/sessions/{sid}", headers=headers).json()
    assert crossroad["available_actions"] == ["advance", "end"]
    assert main.ladder_repository.stage(1).title not in str(crossroad)

    first = client.post(f"/api/sessions/{sid}/advance", headers=headers)
    assert first.status_code == 200
    assert first.json()["session"]["current_stage_index"] == 1
    assert first.json()["stage"]["title"] == main.ladder_repository.stage(1).title
    assert first.json()["appended_messages"][0]["content"] == (
        main.ladder_repository.stage(1).opening_statement
    )

    assert client.post(f"/api/sessions/{sid}/advance", headers=headers).status_code == 409
    history = client.get(f"/api/sessions/{sid}", headers=headers).json()["messages"]
    assert (
        sum(m["content"] == main.ladder_repository.stage(1).opening_statement for m in history) == 1
    )
    assert client.post(f"/api/sessions/{sid}/end", headers=headers).status_code == 200
    assert client.post(f"/api/sessions/{sid}/advance", headers=headers).status_code == 409

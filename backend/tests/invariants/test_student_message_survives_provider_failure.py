from app.api.deps import get_service
from app.main import app
from app.services.conversation import ConversationService


class CapturingProvider:
    def __init__(self):
        self.last_student_text = None

    def generate(self, request):
        if request.kind == "respond":
            self.last_student_text = request.messages[-1].content
            return {
                "reply_text": "為什麼？",
                "observations": {
                    "has_position": True, "has_reason": False, "reason_tested": False,
                    "principle_label": "未明", "position_shifted": False,
                },
            }
        raise AssertionError("此測試不應產生總結")


def test_student_message_is_persisted_before_provider_is_called(
    client, learner_id, exploding_service
):
    """設計規格 §10：學生打了一大段思考，結果模型超時、整段消失——
    這是這個產品最不能發生的事。

    順序必須是：存學生訊息 → commit → 呼叫 provider。
    """
    session_id = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()["session"]["id"]

    failed = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我想了很久才寫出這一段"},
        headers={"X-Learner-Id": learner_id},
    )
    assert failed.status_code == 503

    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    contents = [m["content"] for m in detail.json()["messages"]]
    assert "我想了很久才寫出這一段" in contents
    assert detail.json()["available_actions"] == ["retry", "end"]


def test_retry_resumes_without_retyping(client, learner_id, exploding_service):
    session_id = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()["session"]["id"]
    client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我想了很久"},
        headers={"X-Learner-Id": learner_id},
    )

    app.dependency_overrides.pop(get_service, None)  # 回到正常的 scripted provider
    response = client.post(
        f"/api/sessions/{session_id}/retry", headers={"X-Learner-Id": learner_id}
    )
    assert response.status_code == 200
    assert response.json()["appended_messages"][0]["role"] == "tutor"
    again = client.post(
        f"/api/sessions/{session_id}/retry", headers={"X-Learner-Id": learner_id}
    )
    assert again.status_code == 409


def test_retry_without_pending_student_message_is_rejected(client, learner_id):
    session_id = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()["session"]["id"]
    response = client.post(
        f"/api/sessions/{session_id}/retry", headers={"X-Learner-Id": learner_id}
    )
    assert response.status_code == 409


def test_second_message_cannot_skip_pending_reply(client, learner_id, exploding_service):
    session_id = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()["session"]["id"]
    client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "先前的發言"}, headers={"X-Learner-Id": learner_id},
    )
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "新發言"}, headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 409


def test_provider_receives_latest_persisted_student_message(client, learner_id, db):
    from app.tutor.gateway import TutorGateway
    import app.main as main

    provider = CapturingProvider()
    app.dependency_overrides[get_service] = lambda: ConversationService(
        db, main.ladder_repository, TutorGateway(provider)
    )
    try:
        session_id = client.post(
            "/api/sessions", json={"ladder_id": "trolley"},
            headers={"X-Learner-Id": learner_id},
        ).json()["session"]["id"]
        response = client.post(
            f"/api/sessions/{session_id}/messages", json={"text": "我最新的發言"},
            headers={"X-Learner-Id": learner_id},
        )
        assert response.status_code == 200
        assert provider.last_student_text == "我最新的發言"
    finally:
        app.dependency_overrides.pop(get_service, None)

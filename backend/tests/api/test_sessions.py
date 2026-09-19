def test_create_session_returns_opening_and_actions(client, learner_id):
    response = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["session"]["flow_state"] == "active_in_stage"
    assert body["session"]["total_stages"] >= 1
    assert body["available_actions"] == ["send_message", "end"]
    assert body["stage"]["index"] == 0
    assert len(body["appended_messages"]) == 1
    assert body["summary"] is None


def test_get_session_returns_full_history(client, learner_id):
    created = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()
    session_id = created["session"]["id"]

    response = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    assert response.status_code == 200
    body = response.json()
    assert len(body["messages"]) == 1
    assert body["messages"][0]["role"] == "tutor"


def test_missing_learner_header_is_rejected(client):
    response = client.post("/api/sessions", json={"ladder_id": "trolley"})
    assert response.status_code == 422

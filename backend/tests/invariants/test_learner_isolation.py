import uuid


def test_other_learner_cannot_read_session(client, learner_id):
    created = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()
    session_id = created["session"]["id"]

    response = client.get(
        f"/api/sessions/{session_id}", headers={"X-Learner-Id": str(uuid.uuid4())}
    )
    assert response.status_code == 403

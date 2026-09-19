def test_response_never_contains_unentered_stage_titles(client, learner_id, two_stage_app):
    created = client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    )
    assert "情境 1" not in created.text
    assert "情境 0" in created.text

    session_id = created.json()["session"]["id"]
    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    assert "情境 1" not in detail.text

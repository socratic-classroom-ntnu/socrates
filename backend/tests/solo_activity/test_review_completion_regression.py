"""The advertised review action must complete after the final question."""

from tests.solo_activity.test_solo_attempts_api import confirm, do, ok, setup, start, to_confirming


def test_review_action_after_last_question_must_be_usable(client, tutor):
    _, replies = tutor
    context = setup(client)
    attempt = ok(start(client, context["activity_id"]))
    view = confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    assert view["state"] == "reviewing"
    assert "submit_review" in view["available_actions"]
    response = do(client, attempt["id"], "submit_review")
    assert response.status_code == 200, response.text

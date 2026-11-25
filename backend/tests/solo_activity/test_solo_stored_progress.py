"""A stored attempt is read back by the fields this version knows.

A later version may store more per scenario (or in the final summary); going back to this
version after someone answered must still read those attempts instead of failing on them.
"""

from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt
from tests.solo_activity.test_solo_attempts_api import NOT_MET, answer, ok, setup, start


def test_fields_from_a_later_version_are_skipped_when_reading(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"], "不能主動害人")
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt["id"])
        row.progress = [{**entry, "stances": [{"stance_id": "s1"}]} for entry in row.progress]
        row.final = {**(row.final or {}), "added_later": True}
    view = ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))
    assert view["state"] == "in_dialogue"
    assert [m["text"] for m in view["messages"] if m["role"] == "student"] == ["不能主動害人"]

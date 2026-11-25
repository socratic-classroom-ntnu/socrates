"""A student who deleted their account: their answers stay and still count, shown as 已刪除的帳號.

The account row stays with kind "deleted" and its names cleared, so every teacher view lists the
student without a name, email or guest number, and the roster counts them on their own.
"""

from tests.course_management.conftest import switch
from tests.solo_activity.test_solo_attempts_api import ok, setup, start
from tests.solo_activity.test_solo_progress_api import progress, student_row
from tests.solo_activity.test_solo_radar_api import DIMENSIONS, class_of, get_radar, scores
from tests.solo_activity.test_solo_roster_api import roster


def delete_account(client, username):
    response = client.request("DELETE", "/api/v2/account", json={"username": username})
    assert response.status_code == 200, response.text


def deleted_student(client):
    s = setup(client)
    ok(start(client, s["activity_id"]))
    delete_account(client, "student")
    switch(client, s["teacher"])
    return s


def test_the_roster_lists_them_as_deleted_and_counts_them_apart(client, tutor):
    s = deleted_student(client)

    view = ok(roster(client, s["course"]["id"]))

    (row,) = view["students"]
    assert (row["kind"], row["display_name"], row["email"]) == ("deleted", "", None)
    assert view["summary"] == {
        "total": 1,
        "registered": 0,
        "guests": 0,
        "expired_guests": 0,
        "deleted": 1,
    }


def test_progress_and_analysis_still_show_their_attempt(client, tutor):
    s = deleted_student(client)

    live = ok(progress(client, s["activity_id"]))
    row = student_row(live, "")
    assert (row["kind"], row["guest_number"], row["overall"]) == ("deleted", None, "in_progress")
    analysis = client.get(f"/api/v2/solo/activities/{s['activity_id']}/analysis")
    assert analysis.status_code == 200, analysis.text


def test_the_radar_names_them_deleted(client, tutor):
    _, replies = tutor
    s, _ = class_of(client, 2)
    switch(client, {"username": "s00"})
    delete_account(client, "s00")
    switch(client, s["teacher"])
    replies.extend([DIMENSIONS, scores(), scores()])

    view = ok(get_radar(client, s))

    assert sorted(entry["display_name"] for entry in view["students"]) == [
        "s01同學",
        "已刪除的帳號",
    ]

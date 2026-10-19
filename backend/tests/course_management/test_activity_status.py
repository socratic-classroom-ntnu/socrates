from types import SimpleNamespace

import pytest

from app.modules.course_management.domain.activity_status import status, teacher_actions


def times(published_at=100.0, starts_at=200.0, ends_at=300.0):
    return SimpleNamespace(published_at=published_at, starts_at=starts_at, ends_at=ends_at)


@pytest.mark.parametrize(
    ("activity", "now", "expected"),
    [
        (times(published_at=None), 250.0, "draft"),
        (times(), 199.0, "scheduled"),
        (times(), 200.0, "open"),
        (times(), 299.0, "open"),
        (times(), 300.0, "ended"),
    ],
)
def test_status_boundaries(activity, now, expected):
    assert status(activity, now) == expected


@pytest.mark.parametrize(
    ("current", "locked", "expected"),
    [
        ("draft", False, ["update", "publish", "copy", "delete"]),
        (
            "scheduled",
            False,
            ["update", "update_details", "publish", "start_now", "end_now", "copy", "delete"],
        ),
        ("scheduled", True, ["update_details", "start_now", "end_now", "copy", "delete"]),
        ("open", False, ["update", "update_details", "publish", "end_now", "copy", "delete"]),
        ("open", True, ["update_details", "end_now", "copy", "delete"]),
        ("ended", False, ["copy", "delete"]),
        ("ended", True, ["copy", "delete"]),
    ],
)
def test_teacher_actions_per_status(current, locked, expected):
    assert teacher_actions(current, locked=locked) == expected

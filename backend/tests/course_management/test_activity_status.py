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


def test_teacher_actions_per_status():
    assert teacher_actions("draft", locked=False) == ["update", "publish", "copy"]
    assert teacher_actions("scheduled", locked=False) == [
        "update",
        "publish",
        "start_now",
        "end_now",
        "copy",
    ]
    assert teacher_actions("open", locked=False) == ["update", "publish", "end_now", "copy"]
    assert teacher_actions("open", locked=True) == ["end_now", "copy"]
    assert teacher_actions("ended", locked=False) == ["copy"]

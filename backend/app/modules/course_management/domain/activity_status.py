"""Activity lifecycle: status from server time, and which teacher actions each status allows."""

from typing import Literal, Protocol

ActivityStatus = Literal["draft", "scheduled", "open", "ended"]
TeacherAction = Literal["update", "publish", "start_now", "end_now", "copy"]

_ORDER: tuple[TeacherAction, ...] = ("update", "publish", "start_now", "end_now", "copy")


class ActivityTimes(Protocol):
    # Read-only members so ORM rows (SQLAlchemy Mapped descriptors) satisfy the protocol too.
    @property
    def published_at(self) -> float | None: ...

    @property
    def starts_at(self) -> float | None: ...

    @property
    def ends_at(self) -> float | None: ...


def status(activity: ActivityTimes, now: float) -> ActivityStatus:
    if activity.published_at is None:
        return "draft"
    if activity.ends_at is not None and now >= activity.ends_at:
        return "ended"
    if activity.starts_at is not None and now >= activity.starts_at:
        return "open"
    return "scheduled"


def teacher_actions(current: ActivityStatus, locked: bool) -> list[TeacherAction]:
    allowed: set[TeacherAction] = {"copy"}
    if current == "draft":
        allowed |= {"update", "publish"}
    if current in ("scheduled", "open"):
        allowed.add("end_now")
        if not locked:
            allowed |= {"update", "publish"}
    if current == "scheduled":
        allowed.add("start_now")
    return [action for action in _ORDER if action in allowed]

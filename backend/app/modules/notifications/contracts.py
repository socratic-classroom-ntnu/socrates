from typing import Annotated, Literal

from pydantic import BaseModel, Field

Audience = Literal["all", "teacher", "student"]


class AnnouncementInput(BaseModel):
    audience: Audience
    title: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1, max_length=500)
    maintenance_date: str | None = None
    maintenance_start: str | None = None
    maintenance_end: str | None = None


class AnnouncementView(AnnouncementInput):
    id: str
    published_by: str
    published_by_username: str
    published_at: float


class MaintenanceWindow(BaseModel):
    date: str
    start: str
    end: str


class Notice(BaseModel):
    id: str
    title: str
    content: str
    time: float
    read: bool
    pop_up: bool


class AnnouncementNotice(Notice):
    type: Literal["announcement"] = "announcement"
    maintenance: MaintenanceWindow | None


class GuestExpiryNotice(Notice):
    type: Literal["guest_expiry"] = "guest_expiry"
    guest_expires_at: float


class ActivityNotice(Notice):
    type: Literal["activity"] = "activity"
    course_name: str
    activity_id: str
    activity_name: str


Notification = Annotated[
    AnnouncementNotice | GuestExpiryNotice | ActivityNotice, Field(discriminator="type")
]


class NotificationReadInput(BaseModel):
    id: str

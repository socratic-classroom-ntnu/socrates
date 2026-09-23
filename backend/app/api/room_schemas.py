from typing import Literal

from pydantic import BaseModel, Field

from app.api.schemas import SessionDetail

TutorPresenceState = Literal["idle", "listening", "thinking", "speaking"]


class RoomCapabilities(BaseModel):
    history: bool = True
    text_input: bool = True
    voice_input: bool = True
    transcript_draft: bool = True


class RoomProjection(BaseModel):
    room_revision: str = "ce-room-v1"
    tutor_state: TutorPresenceState = "idle"
    avatar_id: Literal["brunette"] = "brunette"
    capabilities: RoomCapabilities = Field(default_factory=RoomCapabilities)


class ConversationRoomView(BaseModel):
    detail: SessionDetail
    room: RoomProjection

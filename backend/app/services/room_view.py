from app.api.room_schemas import (
    ConversationRoomView,
    RoomProjection,
    TutorPresenceState,
)
from app.api.schemas import SessionDetail


def build_room_view(detail: SessionDetail) -> ConversationRoomView:
    """Compose the CE room projection without duplicating flow-state rules."""
    pending_reply = bool(detail.messages and detail.messages[-1].role == "student")
    tutor_state: TutorPresenceState = "thinking" if pending_reply else "idle"
    return ConversationRoomView(
        detail=detail,
        room=RoomProjection(tutor_state=tutor_state),
    )

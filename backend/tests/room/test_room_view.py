import uuid

from app.api.schemas import MessageView, SessionDetail, SessionInfo, StageView
from app.domain.types import MessageRole
from app.services.room_view import build_room_view


def make_detail(role: MessageRole = "tutor") -> SessionDetail:
    return SessionDetail(
        session=SessionInfo(
            id=uuid.uuid4(),
            status="active",
            flow_state="active_in_stage",
            current_stage_index=0,
            total_stages=3,
        ),
        stage=StageView(index=0, key="trolley", title="Trolley", opening_statement="Start"),
        messages=[MessageView(seq=0, role=role, content="hello")],
        available_actions=["send_message", "end"],
        summary=None,
    )


def test_room_projection_uses_brunette_and_capabilities() -> None:
    room = build_room_view(make_detail())
    assert room.room.avatar_id == "brunette"
    assert room.room.room_revision == "ce-room-v1"
    assert room.room.capabilities.voice_input is True


def test_pending_student_message_projects_thinking() -> None:
    room = build_room_view(make_detail("student"))
    assert room.room.tutor_state == "thinking"

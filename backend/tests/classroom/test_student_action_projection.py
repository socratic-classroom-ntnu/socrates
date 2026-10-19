from app.modules.classroom_core.runtime import room_available_actions


def test_reaction_projection_matches_endpoint_phase_gate():
    focus = {"member_id": "m1", "status": "AWAITING_STUDENT"}
    assert room_available_actions({"phase": "focus"}, None, "m2", focus, False) == [
        "barrage",
        "reaction",
    ]
    assert room_available_actions({"phase": "focus_summary"}, None, "m2", focus, False) == [
        "barrage"
    ]
    assert room_available_actions({"phase": "arena"}, None, "m2", focus, False) == []


def test_selected_focus_student_gets_message_action_after_general_actions():
    focus = {"member_id": "m1", "status": "AWAITING_STUDENT"}
    assert room_available_actions({"phase": "focus"}, None, "m1", focus, False) == [
        "barrage",
        "reaction",
        "focus_message",
    ]


def test_teacher_projection_uses_reachable_phases():
    assert room_available_actions({"phase": "focus"}, None, None, None, True) == ["next"]
    assert room_available_actions({"phase": "arena"}, None, None, None, True) == []

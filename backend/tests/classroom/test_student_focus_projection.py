from app.services.classroom import focus_projection


FOCUS = {
    "id": "focus-1",
    "member_id": "m1",
    "last_observations": {"has_position": True},
    "messages": [
        {"role": "student", "text": "我的理由", "draft": True},
        {
            "role": "tutor",
            "text": "條件改變時呢？",
            "observations": {"has_position": True, "has_reason": True},
            "provenance": {"provider": "fixture"},
        },
    ],
}


def test_student_focus_messages_contain_role_and_text_only():
    projected = focus_projection(FOCUS, False)
    assert "last_observations" not in projected
    assert projected["messages"] == [
        {"role": "student", "text": "我的理由"},
        {"role": "tutor", "text": "條件改變時呢？"},
    ]


def test_teacher_focus_projection_keeps_policy_evidence():
    projected = focus_projection(FOCUS, True)
    assert projected["last_observations"] == {"has_position": True}
    assert projected["messages"][1]["observations"]["has_reason"] is True
    assert projected is not FOCUS

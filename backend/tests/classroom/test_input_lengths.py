"""每個接收使用者輸入的請求模型都有長度上限，超過時在驗證層回 422。"""

import pytest
from pydantic import ValidationError

from app.api.classroom_schemas import (
    CreateRoom,
    JoinRoom,
    Login,
    MailRequest,
    PublicQuestion,
    Reaction,
    TokenRequest,
)
from app.api.routes.ai_students import AddAIStudents, OtherSuggestionRequest
from app.api.routes.groups import Configure, GroupCommand, Start
from app.api.routes.provider_profiles import CreateProfile, SettingsUpdate
from app.api.schemas import CreateSessionRequest

LONG = "x" * 5000
ACTION = "action-0001"
QUESTION = {
    "id": "q",
    "title": "t",
    "scenario": "s",
    "options": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}],
}

CASES = [
    (Login, {"login": LONG, "password": "p"}),
    (Login, {"login": "u", "password": LONG}),
    (MailRequest, {"email": LONG}),
    (TokenRequest, {"token": LONG}),
    (CreateRoom, {"script_id": LONG}),
    (JoinRoom, {"code": LONG, "alias": "a"}),
    (JoinRoom, {"code": "ABC", "alias": "a", "avatar": LONG}),
    (Reaction, {"action_id": ACTION, "kind": "like", "focus_id": LONG, "turn_index": 0}),
    (PublicQuestion, {**QUESTION, "tutor_goal": LONG}),
    (PublicQuestion, {**QUESTION, "probe_hints": [LONG]}),
    (PublicQuestion, {**QUESTION, "probe_hints": ["h"] * 21}),
    (
        Configure,
        {
            "action_id": ACTION,
            "expected_roster_digest": LONG,
            "group_count": 1,
            "members_per_group": 1,
        },
    ),
    (
        Configure,
        {
            "action_id": ACTION,
            "expected_roster_digest": "d",
            "group_count": 1,
            "members_per_group": 1,
            "assignments": {LONG: 0},
        },
    ),
    (Start, {"action_id": ACTION, "expected_roster_digest": LONG}),
    (GroupCommand, {"action_id": ACTION, "kind": LONG}),
    (CreateProfile, {"name": "n", "adapter": LONG, "default_model": "m"}),
    (SettingsUpdate, {"default_profile_id": LONG}),
    (SettingsUpdate, {"model_matrix": {"ai_student": LONG}}),
    (SettingsUpdate, {"model_matrix": {LONG: "m"}}),
    (SettingsUpdate, {"active_room_id": LONG}),
    (AddAIStudents, {"action_id": ACTION, "count": 1, "provider_profile_id": LONG}),
    (
        OtherSuggestionRequest,
        {"question_id": "q", "title": "t", "scenario": "s", "existing_options": [LONG]},
    ),
    (OtherSuggestionRequest, {"question_id": "q", "title": "t", "scenario": "s", "room_id": LONG}),
    (CreateSessionRequest, {"ladder_id": LONG}),
]


@pytest.mark.parametrize(("model", "payload"), CASES, ids=lambda v: getattr(v, "__name__", ""))
def test_overlong_input_is_rejected(model, payload):
    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_ordinary_inputs_still_pass():
    Login.model_validate({"login": "arthur", "password": "x" * 20})
    JoinRoom.model_validate({"code": "AB12CD34", "alias": "小明"})
    SettingsUpdate.model_validate({"model_matrix": {"ai_student": "openai/gpt-4o-mini"}})
    PublicQuestion.model_validate(QUESTION)

import pytest
from pydantic import ValidationError

from app.api.classroom_schemas import JoinRoom, Option, Register
from app.api.routes.ai_students import AddAIStudents, OtherSuggestionRequest
from app.api.routes.classroom_library import CreateClassroom
from app.api.routes.groups import GroupCommand
from app.api.routes.provider_profiles import CreateProfile
from app.api.schemas import CreateSessionRequest
from app.api.transcript_schemas import TranscriptDraftCreate


def test_classroom_contracts_trim_before_length_validation():
    option = Option(id="  a  ", text="  選項文字  ")
    assert option.model_dump() == {"id": "a", "text": "選項文字"}
    joined = JoinRoom(code="  ab12cd34  ", alias="  學生  ", avatar="  scholar  ")
    assert joined.code == "ab12cd34"
    assert joined.alias == "學生"
    assert joined.avatar == "scholar"


def test_route_local_mutations_share_trimmed_contract():
    assert CreateClassroom(action_id="  action-id  ", title="  課程  ").model_dump() == {
        "action_id": "action-id",
        "title": "課程",
    }
    assert GroupCommand(action_id="  action-id  ", kind="  next  ").kind == "next"
    assert AddAIStudents(action_id="  action-id  ", count=1, model="  model-x  ").model == (
        "model-x"
    )
    assert (
        OtherSuggestionRequest(question_id="  q1  ", title="  題目  ", scenario="  情境  ").scenario
        == "情境"
    )


def test_provider_and_legacy_inputs_trim_consistently():
    profile = CreateProfile(
        name="  local  ",
        adapter="  openai  ",
        default_model="  gpt-test  ",
        credential_mode="PERSISTENT",
    )
    assert (profile.name, profile.adapter, profile.default_model) == (
        "local",
        "openai",
        "gpt-test",
    )
    assert TranscriptDraftCreate(text="  speech  ").text == "speech"
    assert CreateSessionRequest(ladder_id="  trolley  ").ladder_id == "trolley"


def test_whitespace_only_values_fail_min_length_after_trim():
    with pytest.raises(ValidationError) as option_error:
        Option(id="   ", text="內容")
    assert option_error.value.errors()[0]["loc"] == ("id",)

    with pytest.raises(ValidationError) as transcript_error:
        TranscriptDraftCreate(text="   ")
    assert transcript_error.value.errors()[0]["loc"] == ("text",)


def test_account_text_fields_follow_same_order():
    account = Register(
        username="  teacher  ",
        email="  teacher@example.org  ",
        password="  Socratic-123456  ",
    )
    assert account.username == "teacher"
    assert account.email == "teacher@example.org"
    assert account.password == "Socratic-123456"

from pathlib import Path

import pytest

from app.config import settings
from app.domain.tutor import ProviderRequest
from app.ladders.repository import LadderRepository
from app.orchestrator.policy import should_advance
from app.tutor.gateway import TutorGateway
from app.tutor.scripted import ScriptedProvider


def _request(turn_index: int) -> ProviderRequest:
    return ProviderRequest(
        kind="respond", stage_key="trolley_basic", turn_index=turn_index, messages=[]
    )


def test_returns_scripted_reply_for_turn():
    provider = ScriptedProvider.load(settings.script_path)
    first = provider.generate(_request(0))
    assert first["observations"]["reason_tested"] is False
    assert first["reply_text"]

    third = provider.generate(_request(2))
    assert third["observations"]["reason_tested"] is True


def test_ignores_student_text_so_runs_are_reproducible():
    """腳本只看「第幾輪」，不看學生打了什麼——這正是驗收可重現的原因。"""
    provider = ScriptedProvider.load(settings.script_path)
    assert provider.generate(_request(1)) == provider.generate(_request(1))


def test_clamps_to_last_turn_when_index_overflows():
    provider = ScriptedProvider.load(settings.script_path)
    assert provider.generate(_request(99)) == provider.generate(_request(2))


def test_summarize_returns_structured_draft():
    provider = ScriptedProvider.load(settings.script_path)
    draft = provider.generate(
        ProviderRequest(kind="summarize", stage_key=None, turn_index=0, messages=[])
    )
    assert draft["core_principle"]
    assert draft["tension"]
    assert draft["shifted"] is True


@pytest.mark.parametrize(
    "script_name",
    ["trolley.script.yaml", "trolley.capped.script.yaml", "trolley.shifted.script.yaml"],
)
def test_each_acceptance_script_can_respond_in_all_three_stages(script_name: str):
    ladder = LadderRepository.load(settings.ladder_path)
    path = Path(settings.script_path).with_name(script_name)
    gateway = TutorGateway(ScriptedProvider.load(str(path)))

    for stage in ladder.get().stages:
        assert gateway.respond(stage, [], turn_index=0).reply_text.strip()


def test_normal_script_reaches_goal_only_after_student_replies_to_challenge():
    ladder = LadderRepository.load(settings.ladder_path)
    gateway = TutorGateway(ScriptedProvider.load(settings.script_path))

    for stage in ladder.get().stages:
        turns = [gateway.respond(stage, [], turn_index=index) for index in range(3)]
        assert [
            should_advance(turn.observations, turn_count=index) for index, turn in enumerate(turns)
        ] == [False, False, True]


def test_normal_script_summary_tracks_the_three_sample_stances():
    gateway = TutorGateway(ScriptedProvider.load(settings.script_path))

    draft = gateway.summarize([])

    assert [(entry.stage_key, entry.label) for entry in draft.stance_by_stage] == [
        ("trolley_basic", "後果主義"),
        ("footbridge", "義務論"),
        ("transplant", "義務論"),
    ]
    assert draft.shifted is True


def test_final_stage_has_distinct_replies_for_three_extra_wrap_up_turns():
    ladder = LadderRepository.load(settings.ladder_path)
    gateway = TutorGateway(ScriptedProvider.load(settings.script_path))

    replies = [
        gateway.respond(ladder.stage(2), [], turn_index=index).reply_text for index in range(2, 6)
    ]

    assert len(set(replies)) == 4


def test_capped_script_never_reports_the_first_stage_goal_as_met():
    ladder = LadderRepository.load(settings.ladder_path)
    path = Path(settings.script_path).with_name("trolley.capped.script.yaml")
    gateway = TutorGateway(ScriptedProvider.load(str(path)))

    turns = [gateway.respond(ladder.stage(0), [], turn_index=index) for index in range(6)]

    assert all(
        not should_advance(turn.observations, turn_count=index) for index, turn in enumerate(turns)
    )
    assert gateway.summarize([]).stance_by_stage[0].label == "未明"


def test_shifted_script_asks_for_one_more_turn_before_stage_completion():
    ladder = LadderRepository.load(settings.ladder_path)
    path = Path(settings.script_path).with_name("trolley.shifted.script.yaml")
    gateway = TutorGateway(ScriptedProvider.load(str(path)))

    turns = [gateway.respond(ladder.stage(0), [], turn_index=index) for index in range(4)]

    assert turns[2].observations.position_shifted is True
    assert turns[2].observations.reason_tested is True
    assert [
        should_advance(turn.observations, turn_count=index) for index, turn in enumerate(turns)
    ] == [False, False, False, True]

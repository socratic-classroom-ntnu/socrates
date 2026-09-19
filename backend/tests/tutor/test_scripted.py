from app.domain.tutor import ProviderRequest
from app.tutor.scripted import ScriptedProvider


def _request(turn_index: int) -> ProviderRequest:
    return ProviderRequest(
        kind="respond", stage_key="trolley_basic", turn_index=turn_index, messages=[]
    )


def test_returns_scripted_reply_for_turn():
    provider = ScriptedProvider.load("../scripts/trolley.script.yaml")
    first = provider.generate(_request(0))
    assert first["observations"]["reason_tested"] is False
    assert first["reply_text"]

    third = provider.generate(_request(2))
    assert third["observations"]["reason_tested"] is True


def test_ignores_student_text_so_runs_are_reproducible():
    """腳本只看「第幾輪」，不看學生打了什麼——這正是驗收可重現的原因。"""
    provider = ScriptedProvider.load("../scripts/trolley.script.yaml")
    assert provider.generate(_request(1)) == provider.generate(_request(1))


def test_clamps_to_last_turn_when_index_overflows():
    provider = ScriptedProvider.load("../scripts/trolley.script.yaml")
    assert provider.generate(_request(99)) == provider.generate(_request(2))


def test_summarize_returns_structured_draft():
    provider = ScriptedProvider.load("../scripts/trolley.script.yaml")
    draft = provider.generate(
        ProviderRequest(kind="summarize", stage_key=None, turn_index=0, messages=[])
    )
    assert draft["core_principle"]
    assert draft["tension"]
    assert draft["shifted"] is False

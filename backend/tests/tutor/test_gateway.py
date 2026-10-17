from app.domain.ladder import Stage
from app.domain.tutor import ProviderRequest, ProviderResponse
from app.tutor.gateway import TutorGateway

STAGE = Stage(
    key="s1",
    title="T",
    opening_statement="O",
    teaching_goal="G",
    probe_hints=[],
    max_turns=4,
)

GOOD = {
    "reply_text": "為什麼？",
    "observations": {
        "has_position": True,
        "has_reason": False,
        "reason_tested": False,
        "principle_label": "未明",
        "position_shifted": False,
    },
}


class FakeProvider:
    def __init__(self, responses: list[ProviderResponse]) -> None:
        self.responses = responses
        self.calls = 0

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.calls += 1
        return self.responses[min(self.calls - 1, len(self.responses) - 1)]


def test_returns_validated_turn():
    gateway = TutorGateway(FakeProvider([GOOD]))
    turn = gateway.respond(STAGE, [], turn_index=0)
    assert turn.reply_text == "為什麼？"
    assert turn.observations.has_position is True


def test_retries_once_then_succeeds():
    provider = FakeProvider([{"reply_text": "壞掉"}, GOOD])
    gateway = TutorGateway(provider)
    turn = gateway.respond(STAGE, [], turn_index=0)
    assert turn.reply_text == "為什麼？"
    assert provider.calls == 2


def test_summary_retries_and_rejects_out_of_scope_stances():
    import pytest

    from app.tutor.gateway import TutorUnavailable

    provider = FakeProvider(
        [
            {
                "core_principle": "fixture",
                "tension": "",
                "stance_by_stage": [
                    {"stage_key": "unreached", "label": "未明", "note": "future fixture"}
                ],
                "shifted": False,
            }
        ]
    )
    with pytest.raises(TutorUnavailable, match="outside the reached scope"):
        TutorGateway(provider).summarize([], ("s1",))
    assert provider.calls == 2


def test_summary_provider_receives_the_authoritative_reached_scope():
    class ScopeProvider:
        def generate(self, request):
            assert request.kind == "summarize"
            assert request.reached_stage_keys == ("s1",)
            return {
                "core_principle": "fixture",
                "tension": "",
                "stance_by_stage": [{"stage_key": "s1", "label": "未明", "note": "fixture"}],
                "shifted": False,
            }

    assert TutorGateway(ScopeProvider()).summarize([], ("s1",)).core_principle == "fixture"

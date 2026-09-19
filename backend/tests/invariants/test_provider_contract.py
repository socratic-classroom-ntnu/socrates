import pytest

from app.domain.ladder import Stage
from app.tutor.gateway import TutorGateway, TutorUnavailable

STAGE = Stage(
    key="s1", title="T", opening_statement="O", teaching_goal="G",
    probe_hints=[], max_turns=4,
)


class AlwaysBadProvider:
    def generate(self, request):
        return {"reply_text": "少了 observations"}


class MissingFieldProvider:
    def generate(self, request):
        return {
            "reply_text": "少一個欄位",
            "observations": {
                "has_position": True, "has_reason": True, "reason_tested": True,
                "principle_label": "後果主義",
            },
        }


def test_malformed_output_is_rejected_not_passed_through():
    """post-processor 必須擋下壞格式，重試一次後仍失敗才算失敗。

    若讓壞掉的 observations 流進 Orchestrator，推進判準會用到垃圾資料。"""
    with pytest.raises(TutorUnavailable):
        TutorGateway(AlwaysBadProvider()).respond(STAGE, [], turn_index=0)


def test_missing_observation_field_is_a_failure():
    with pytest.raises(TutorUnavailable):
        TutorGateway(MissingFieldProvider()).respond(STAGE, [], turn_index=0)


class ExplodingProvider:
    def generate(self, request):
        raise RuntimeError("provider 連線中斷")


def test_provider_exception_becomes_tutor_unavailable():
    with pytest.raises(TutorUnavailable):
        TutorGateway(ExplodingProvider()).respond(STAGE, [], turn_index=0)

"""單人活動的 7 個 LLM 輸出 schema（docs/classroom/PROMPT-DESIGN.md）：每個各一個合格、一個不合格的樣本。"""

from copy import deepcopy

import pytest
from pydantic import BaseModel, ValidationError

from app.modules.ai_providers.provider_schema import (
    gemini_response_schema,
    openai_response_schema,
)
from app.modules.llm_runtime.contracts import (
    ActivityExpansion,
    FinalSummary,
    RadarAxisNames,
    RadarDimensions,
    RadarScores,
    SoloFlags,
    SoloObservations,
    SoloTutorTurn,
    StanceClassification,
)
from app.modules.llm_runtime.policy import should_advance

FLAGS = {
    "off_topic": 0,
    "malicious_off_topic": 0,
    "danger_tendency": 0,
    "low_effort": 0,
    "gave_reason": 1,
    "used_example": 0,
    "considered_counterpoint": 0,
    "built_on_tutor": 1,
    "asked_question": 0,
    "self_corrected": 0,
}
OBSERVATIONS = {
    "has_position": True,
    "has_reason": True,
    "reason_tested": False,
    "position_shifted": False,
    "principle_label": "義務論",
    "stance_id": "s2",
}
CITED = {
    "points": [
        {
            "text": "你認為親手推人和拉桿不一樣。",
            "sources": [{"message_ref": "m3", "quote": "親手推下去就是我殺的"}],
        }
    ]
}
DIMENSION = {"name": "責任歸屬", "low_pole": "看結果", "high_pole": "看行為本身"}

VALID: dict[type[BaseModel], dict] = {
    SoloTutorTurn: {
        "reply_text": "「親手」是關鍵。對你來說，親手做和沒有阻止，差在哪裡？",
        "move": "probe",
        "observations": OBSERVATIONS,
        "flags": FLAGS,
        "confirm_summary": None,
        "guard": "on_topic",
    },
    ActivityExpansion: {
        "stances": [
            {"id": "s1", "label": "拉桿", "description": "犧牲一人救五人。"},
            {"id": "s2", "label": "不拉", "description": "不主動造成任何人死亡。"},
        ],
        "tutor_goal": "釐清學生如何看待「做」與「不阻止」的差別。",
        "probe_hints": ["如果那一個人是你認識的人呢？"],
    },
    StanceClassification: {
        "stance_id": "s2",
        "confidence": "high",
        "rationale": "學生明確說不會拉桿，理由是不想親手造成死亡。",
    },
    FinalSummary: {
        **CITED,
        "trajectory": [
            {
                "stance_id": "s1",
                "position": "你一開始選擇拉桿。",
                "shift_reason": "",
                "sources": [{"message_ref": "m1", "quote": "五個人比較多"}],
            },
            {
                "stance_id": "s2",
                "position": "你後來改成不拉。",
                "shift_reason": "你發現自己在意的是誰動手。",
                "sources": [{"message_ref": "m3", "quote": "親手推下去就是我殺的"}],
            },
        ],
        "final_position": "你不會主動犧牲一個人。",
        "reasoning_style": "以行為本身判斷對錯。",
        "open_question": "如果不行動也算一種選擇呢？",
        "normalized_text": "學生從拉桿轉為不拉，關鍵在於親手造成死亡。",
    },
    RadarAxisNames: {"axes": [{**DIMENSION, "axis_index": 0}]},
    RadarDimensions: {"dimensions": [DIMENSION] * 4},
    RadarScores: {
        "scores": [
            {
                "dimension_index": 0,
                "score": 3,
                "sources": [{"message_ref": "m3", "quote": "親手推下去就是我殺的"}],
            }
        ]
    },
}


# (model, 為什麼不合格, 把合格樣本改壞的方式)
INVALID = [
    (SoloTutorTurn, "flag 只能是 0 或 1", lambda s: s["flags"].update(off_topic=2)),
    (SoloTutorTurn, "少一個 flag 就是失敗的回覆", lambda s: s["flags"].pop("danger_tendency")),
    (SoloTutorTurn, "observations 每欄必填", lambda s: s["observations"].pop("stance_id")),
    (SoloTutorTurn, "不接受多餘欄位", lambda s: s.update(unknown_field=1)),
    (StanceClassification, "沒有立場要給 null，不是空字串", lambda s: s.update(stance_id="")),
    (ActivityExpansion, "立場 id 不可重複", lambda s: s["stances"][1].update(id="s1")),
    (StanceClassification, "confidence 只能是三個等級之一", lambda s: s.update(confidence="sure")),
    (FinalSummary, "trajectory 至少一步", lambda s: s.update(trajectory=[])),
    (RadarAxisNames, "同一軸不能命名兩次", lambda s: s["axes"].append(s["axes"][0])),
    (RadarDimensions, "維度至少 4 個", lambda s: s["dimensions"].pop()),
    (RadarScores, "分數範圍 0–4", lambda s: s["scores"][0].update(score=5)),
]


@pytest.mark.parametrize("model", list(VALID), ids=lambda m: m.__name__)
def test_valid_sample_passes(model):
    model.model_validate(VALID[model])


@pytest.mark.parametrize(
    ("model", "change"),
    [(model, change) for model, _, change in INVALID],
    ids=[reason for _, reason, _ in INVALID],
)
def test_invalid_sample_fails(model, change):
    sample = deepcopy(VALID[model])
    change(sample)
    with pytest.raises(ValidationError):
        model.model_validate(sample)


def test_confirm_summary_carries_citations():
    turn = SoloTutorTurn.model_validate({**VALID[SoloTutorTurn], "confirm_summary": CITED})
    assert turn.confirm_summary is not None
    assert turn.confirm_summary.points[0].sources[0].message_ref == "m3"


@pytest.mark.parametrize("model", [SoloFlags, SoloObservations], ids=lambda m: m.__name__)
def test_every_flag_and_observation_is_required(model):
    assert set(model.model_json_schema()["required"]) == set(model.model_fields)


def test_solo_observations_feed_the_shared_policy():
    observations = SoloObservations.model_validate({**OBSERVATIONS, "reason_tested": True})
    assert should_advance(observations, turn_count=1)


@pytest.mark.parametrize("model", list(VALID), ids=lambda m: m.__name__)
def test_provider_schemas_build(model):
    """The OpenAI and Gemini projections build; acceptance by the real APIs is checked by evals."""
    openai_schema = openai_response_schema(model)
    gemini_schema = gemini_response_schema(model)
    assert openai_schema["additionalProperties"] is False
    assert "anyOf" not in str(gemini_schema)

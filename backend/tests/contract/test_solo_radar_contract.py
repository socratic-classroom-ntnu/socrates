"""The teacher radar is one strict browser-facing contract for both computation routes."""

import json
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.modules.solo_activity.contracts import (
    RadarDimensionUpdate,
    RadarView,
)


CITATION = {
    "message_id": "message-1",
    "quote": "親手推下去",
    "start": 3,
    "end": 8,
}
DIMENSIONS = [
    {
        "index": 0,
        "name": "責任歸屬",
        "low_pole": "看結果",
        "high_pole": "看行為本身",
        "source": "embedding",
    },
    {
        "index": 1,
        "name": "公平",
        "low_pole": "維持順序",
        "high_pole": "優先照顧需求",
        "source": "llm",
    },
]
VALID = {
    "dimensions": DIMENSIONS,
    "students": [
        {
            "student_id": "enrollment-1",
            "display_name": "學生一",
            "scores": [
                {"dimension_index": 0, "score": 1.25, "sources": [CITATION]},
                {"dimension_index": 1, "score": 3, "sources": []},
            ],
        },
        {
            "student_id": "enrollment-2",
            "display_name": "匿名訪客 1",
            "scores": [
                {"dimension_index": 0, "score": 4, "sources": []},
                {"dimension_index": 1, "score": 0, "sources": []},
            ],
        },
    ],
}


def test_radar_schema_reuses_the_browser_citation_component():
    schema = RadarView.model_json_schema()

    assert set(schema["properties"]) == {"dimensions", "students"}
    assert set(schema["required"]) == {"dimensions", "students"}
    assert "message_ref" not in repr(schema)
    definitions = schema["$defs"]
    assert definitions["RadarDimensionView"]["properties"]["source"]["enum"] == [
        "embedding",
        "llm",
    ]
    score = definitions["RadarScoreView"]
    assert score["properties"]["sources"]["items"] == {"$ref": "#/$defs/CitationSourceView"}
    assert "sources" in score["required"]
    assert '"message_ref"' not in json.dumps(schema)


def test_embedding_and_llm_dimensions_share_one_public_shape():
    view = RadarView.model_validate(VALID)
    dumped = view.model_dump()

    assert [dimension.source for dimension in view.dimensions] == ["embedding", "llm"]
    assert dumped["students"][0]["scores"][0]["score"] == 1.25
    assert dumped["students"][0]["scores"][1]["score"] == 3.0
    assert list(dumped["students"][0]["scores"][0]["sources"][0]) == [
        "message_id",
        "quote",
        "start",
        "end",
    ]


def _score_out_of_range(payload, score):
    payload["students"][0]["scores"][0]["score"] = score


def _dimension_indices(payload, indices):
    for dimension, index in zip(payload["dimensions"], indices, strict=True):
        dimension["index"] = index


def _student_score_indices(payload, indices):
    for score, index in zip(payload["students"][0]["scores"], indices, strict=True):
        score["dimension_index"] = index


INVALID = [
    ("score below zero", lambda payload: _score_out_of_range(payload, -0.01)),
    ("score above four", lambda payload: _score_out_of_range(payload, 4.01)),
    ("dimensions start above zero", lambda payload: _dimension_indices(payload, [1, 2])),
    ("dimensions are duplicated", lambda payload: _dimension_indices(payload, [0, 0])),
    ("dimensions are reordered", lambda payload: _dimension_indices(payload, [1, 0])),
    ("student misses a dimension", lambda payload: payload["students"][0]["scores"].pop()),
    (
        "student duplicates a dimension",
        lambda payload: _student_score_indices(payload, [0, 0]),
    ),
    ("student scores are reordered", lambda payload: _student_score_indices(payload, [1, 0])),
    (
        "student ids repeat",
        lambda payload: payload["students"][1].update(student_id="enrollment-1"),
    ),
    (
        "more than six dimensions",
        lambda payload: payload["dimensions"].extend(
            {
                **DIMENSIONS[0],
                "index": index,
                "name": f"維度 {index}",
            }
            for index in range(2, 7)
        ),
    ),
    (
        "more than three citations",
        lambda payload: payload["students"][0]["scores"][0].update(
            sources=[CITATION, CITATION, CITATION, CITATION]
        ),
    ),
]


@pytest.mark.parametrize(("_reason", "change"), INVALID, ids=[case[0] for case in INVALID])
def test_radar_rejects_misaligned_or_out_of_range_data(_reason, change):
    payload = deepcopy(VALID)
    change(payload)

    with pytest.raises(ValidationError):
        RadarView.model_validate(payload)


def test_dimension_update_changes_only_the_name():
    assert RadarDimensionUpdate(name="  新的軸名  ").model_dump() == {"name": "新的軸名"}

    for invalid in ({"name": ""}, {"name": "長" * 61}, {"name": "責任", "low_pole": "結果"}):
        with pytest.raises(ValidationError):
            RadarDimensionUpdate.model_validate(invalid)

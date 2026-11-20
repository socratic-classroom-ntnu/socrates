"""The teacher's radar (NEW-FEATURES 3.4): owner-only, built from kept final summaries.

Fewer than 15 students, or no embedding model: the model sets the dimensions and scores each
student with quotes from their own words. 15 or more with the model: PCA axes named by the model,
scores by percentile within the activity. The result is kept until a summary changes.
"""

import pytest
from sqlalchemy import func, select

from app.modules.ai_providers.contracts import EmbeddingUnavailable
from app.modules.platform import storage as storage
from app.modules.solo_activity import radar, tutor_chain
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch, user
from tests.solo_activity.test_solo_analysis_api import student
from tests.solo_activity.test_solo_attempts_api import ok, setup

WORDS = "不能主動害人"


def kept_summary(position="不拉桿", style="從傷害是誰造成的來判斷", text=None):
    return {
        "points": [{"text": "你認為主動害人和任其發生不一樣。", "sources": []}],
        "trajectory": [
            {"stance_id": None, "position": position, "shift_reason": "", "sources": []}
        ],
        "final_position": position,
        "reasoning_style": style,
        "open_question": "什麼都不做，算不算也是一種選擇？",
        "normalized_text": text or f"{position}。{style}。",
    }


def complete(attempt_id, summary=None, status="confirmed", words=WORDS):
    """Finish an attempt with a kept final summary and one student message, written straight in."""
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        row.state = "completed"
        row.final = {
            "summary": summary or kept_summary(),
            "digest": "d",
            "rejections": 0,
            "tries": 1,
            "status": status,
        }
        seq = db.scalar(
            select(func.max(SoloMessage.seq)).where(SoloMessage.attempt_id == attempt_id)
        )
        db.add(
            SoloMessage(
                attempt_id=attempt_id,
                seq=(seq or 0) + 1,
                scenario_index=0,
                role="student",
                text=words,
            )
        )
        db.flush()
        return db.scalars(
            select(SoloMessage.id).where(
                SoloMessage.attempt_id == attempt_id, SoloMessage.role == "student"
            )
        ).all()


def class_of(client, count, summaries=None):
    """The teacher's activity with ``count`` students who all finished with a kept summary."""
    s = setup(client)
    ids = []
    for number in range(count):
        attempt = student(client, s, f"s{number:02d}")
        summary = summaries[number] if summaries else kept_summary()
        ids.append((attempt["id"], complete(attempt["id"], summary)))
    switch(client, s["teacher"])
    return s, ids


def get_radar(client, s):
    return client.get(f"/api/v2/solo/activities/{s['activity_id']}/radar")


DIMENSIONS = {
    "dimensions": [
        {"name": f"維度{i}", "low_pole": f"低端{i}", "high_pole": f"高端{i}"} for i in range(4)
    ]
}


def scores(value=3, quote=WORDS):
    return {
        "scores": [
            {
                "dimension_index": i,
                "score": value,
                "sources": [{"message_ref": "m1", "quote": quote}],
            }
            for i in range(4)
        ]
    }


# ---- who may read it, and when it is ready -------------------------------------------------


def test_only_the_course_owner_reads_the_radar(client, tutor):
    s, _ = class_of(client, 1)
    switch(client, s["student"])
    assert get_radar(client, s).status_code == 404
    user(client, "other-teacher")
    assert get_radar(client, s).status_code == 404


def test_no_kept_final_summary_is_not_ready(client, tutor):
    s = setup(client)
    student(client, s, "unfinished")
    switch(client, s["teacher"])
    response = get_radar(client, s)
    assert (response.status_code, response.json()["detail"]) == (409, "RADAR_NOT_READY")


def test_without_a_provider_the_radar_is_not_ready(client, tutor, monkeypatch):
    s, _ = class_of(client, 2)
    monkeypatch.setattr(tutor_chain, "resolve_owner_chain", lambda *args, **kwargs: ([], None))
    assert get_radar(client, s).json()["detail"] == "RADAR_NOT_READY"


# ---- the scoring route ---------------------------------------------------------------------


def test_a_small_class_is_scored_by_the_model_with_quotes(client, tutor):
    calls, replies = tutor
    s, ids = class_of(client, 2)
    replies.extend([DIMENSIONS, scores(), scores()])
    view = ok(get_radar(client, s))
    assert [d["source"] for d in view["dimensions"]] == ["llm"] * 4
    assert [d["index"] for d in view["dimensions"]] == [0, 1, 2, 3]
    assert len(view["students"]) == 2
    for (_, message_ids), entry in zip(ids, view["students"], strict=True):
        assert [score["score"] for score in entry["scores"]] == [3.0] * 4
        (source,) = entry["scores"][0]["sources"]
        assert source == {"message_id": message_ids[-1], "quote": WORDS, "start": 0, "end": 6}
    assert entry["display_name"] == "s01同學"
    assert len(calls) == 3


def test_an_invented_quote_is_written_again_before_the_score_is_kept(client, tutor):
    calls, replies = tutor
    s, _ = class_of(client, 1)
    # llm-runtime's citation check refuses a quote the student never wrote and asks once more.
    replies.extend([DIMENSIONS, scores(quote="我從沒說過這句"), scores()])
    (entry,) = ok(get_radar(client, s))["students"]
    assert entry["scores"][0]["sources"][0]["quote"] == WORDS
    assert len(calls) == 3


def test_a_student_the_model_cannot_score_is_left_out(client, tutor):
    _, replies = tutor
    s, _ = class_of(client, 2)
    replies.extend([DIMENSIONS, scores(), RuntimeError("down")])
    view = ok(get_radar(client, s))
    assert len(view["students"]) == 1


def test_no_dimensions_means_not_ready(client, tutor):
    _, replies = tutor
    s, _ = class_of(client, 1)
    replies.append(RuntimeError("down"))
    assert get_radar(client, s).json()["detail"] == "RADAR_NOT_READY"


# ---- kept until a summary changes ----------------------------------------------------------


def test_the_radar_is_kept_until_a_summary_changes(client, tutor):
    calls, replies = tutor
    s, ids = class_of(client, 1)
    replies.extend([DIMENSIONS, scores(3)])
    first = ok(get_radar(client, s))
    assert ok(get_radar(client, s)) == first
    assert len(calls) == 2
    complete(ids[0][0], kept_summary("拉桿", "從救最多人來判斷"))
    replies.extend([DIMENSIONS, scores(1)])
    again = ok(get_radar(client, s))
    assert again["students"][0]["scores"][0]["score"] == 1.0
    assert len(calls) == 4


def test_the_teacher_renames_a_dimension(client, tutor):
    _, replies = tutor
    s, _ = class_of(client, 1)
    path = f"/api/v2/solo/activities/{s['activity_id']}/radar/dimensions"
    assert client.patch(f"{path}/0", json={"name": "責任"}).json()["detail"] == "RADAR_NOT_READY"
    replies.extend([DIMENSIONS, scores()])
    ok(get_radar(client, s))
    renamed = ok(client.patch(f"{path}/1", json={"name": "責任"}))
    assert renamed["dimensions"][1]["name"] == "責任"
    assert ok(get_radar(client, s))["dimensions"][1]["name"] == "責任"
    missing = client.patch(f"{path}/5", json={"name": "x"})
    assert (missing.status_code, missing.json()["detail"]) == (404, "RADAR_DIMENSION_NOT_FOUND")


# ---- the vector route ----------------------------------------------------------------------


def spread(count):
    """Two groups of students far apart on one direction, a little noise on another."""
    vectors = []
    for i in range(count):
        side = 1.0 if i % 2 else -1.0
        vectors.append([side, 0.1 * (i % 3), 0.0])
    return vectors


def spread_three(count):
    """Three independent splits of the class, each carrying about a third of the variance."""
    return [
        [1.0 if i % 2 else -1.0, 1.0 if (i // 2) % 2 else -1.0, 1.0 if (i // 4) % 2 else -1.0, 0.0]
        for i in range(count)
    ]


def axis_names(count):
    return {
        "axes": [
            {"axis_index": i, "name": f"軸{i}", "low_pole": f"低{i}", "high_pole": f"高{i}"}
            for i in range(count)
        ]
    }


def test_a_class_of_fifteen_gets_named_principal_axes(client, tutor, monkeypatch):
    calls, replies = tutor
    texts = [f"統整{i}" for i in range(15)]
    s, _ = class_of(client, 15, [kept_summary(text=t) for t in texts])
    seen = []

    def embed(batch):
        seen.append(batch)
        return spread_three(len(batch))

    monkeypatch.setattr(radar, "embed", embed)
    replies.append(axis_names(3))
    view = ok(get_radar(client, s))
    assert seen == [texts]
    assert [(d["source"], d["name"]) for d in view["dimensions"]] == [
        ("embedding", "軸0"),
        ("embedding", "軸1"),
        ("embedding", "軸2"),
    ]
    for axis in range(3):
        on_axis = sorted(entry["scores"][axis]["score"] for entry in view["students"])
        # Each axis spreads the class to both sides of the mean, inside the 0–4 scale.
        assert 0 <= on_axis[0] < 2 < on_axis[-1] <= 4
    assert all(score["sources"] == [] for e in view["students"] for score in e["scores"])
    (call,) = calls
    assert "axes" in call["messages"][1]["content"]


def test_fewer_than_three_axes_falls_back_to_scoring(client, tutor, monkeypatch):
    calls, replies = tutor
    s, _ = class_of(client, 15)
    # One split and a little noise: a single axis carries the class, too few for a radar.
    monkeypatch.setattr(radar, "embed", lambda batch: spread(len(batch)))
    replies.extend([DIMENSIONS] + [scores()] * 15)
    view = ok(get_radar(client, s))
    assert {d["source"] for d in view["dimensions"]} == {"llm"}
    assert len(view["dimensions"]) == 4
    assert len(view["students"]) == 15
    assert not any("axes" in call["messages"][1]["content"] for call in calls)


def test_without_the_embedding_model_a_large_class_falls_back_to_scoring(
    client, tutor, monkeypatch
):
    calls, replies = tutor
    s, _ = class_of(client, 15)

    def missing(_):
        raise EmbeddingUnavailable("no model")

    monkeypatch.setattr(radar, "embed", missing)
    replies.extend([DIMENSIONS] + [scores()] * 15)
    view = ok(get_radar(client, s))
    assert {d["source"] for d in view["dimensions"]} == {"llm"}
    assert len(view["students"]) == 15


# ---- the arithmetic ------------------------------------------------------------------------


def test_scores_are_standard_deviations_from_the_class_mean():
    assert radar.standard_scores([1.0, 3.0]) == [1.0, 3.0]
    assert radar.standard_scores([5.0, 5.0, 5.0]) == [2.0, 2.0, 2.0]
    # Held within 0 to 4: one far outlier lands on the edge, not beyond it.
    scores = radar.standard_scores([0.0] * 20 + [100.0])
    assert scores[-1] == 4.0 and 0 <= min(scores)


def test_axes_explaining_under_the_share_are_dropped():
    vectors = [[1.0 if i % 2 else -1.0, 0.3 * ((i % 4) - 1.5), 0.0] for i in range(12)]
    # The second direction explains about 8% of the variance.
    assert len(radar.principal_axes(vectors, 5)) == 2
    assert len(radar.principal_axes(vectors, 5, 0.05)) == 2
    assert len(radar.principal_axes(vectors, 5, radar.MIN_AXIS_SHARE)) == 1


def test_the_first_axis_follows_the_largest_spread():
    (axis, *rest) = radar.principal_axes(spread(6), 3)
    sides = [1 if value > 0 else -1 for value in axis]
    # The two groups land on opposite ends, whichever sign the axis came out with.
    assert len(set(sides[0::2])) == 1 and len(set(sides[1::2])) == 1
    assert sides[0] != sides[1]
    assert len(rest) <= 2


@pytest.mark.parametrize("vectors", [[[1.0, 0.0]], [[1.0, 0.0], [1.0, 0.0]]])
def test_no_spread_gives_no_axes(vectors):
    assert radar.principal_axes(vectors, 3) == []


def test_the_largest_component_comes_first_whatever_the_class_order():
    # Alternating groups: a fixed start vector is almost orthogonal to this component.
    variances = [sum(c * c for c in axis) for axis in radar.principal_axes(spread(15), 5)]
    assert variances == sorted(variances, reverse=True)
    assert variances[0] > 14

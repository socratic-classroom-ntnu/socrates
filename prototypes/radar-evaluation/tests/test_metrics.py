import pytest

from metrics import (
    axis_name_changes,
    duplicate_pairs,
    is_flat,
    pearson,
    score_spread,
    spread,
    stdev,
)


@pytest.mark.parametrize(
    ("scores", "flat"),
    [
        ([0, 0, 0, 0], True),
        ([4, 4, 4, 4], True),
        ([2, 3, 2, 3], True),
        ([1.5, 2.5, 2.0], True),
        ([1, 3, 2, 2], False),
        ([1.0, 2.01], False),
    ],
)
def test_a_student_is_flat_when_highest_minus_lowest_is_at_most_one(scores, flat):
    assert is_flat(scores) is flat


def test_a_custom_threshold_can_be_reported_alongside():
    assert is_flat([1, 2.5], threshold=1.5) is True
    assert is_flat([1, 2.5]) is False


def test_spread_and_population_stdev():
    assert spread([1, 4, 2]) == 3
    assert stdev([2, 4, 4, 4, 5, 5, 7, 9]) == pytest.approx(2.0)


def test_pearson_of_matching_and_opposite_scores():
    assert pearson([0, 1, 2, 3], [1, 3, 5, 7]) == pytest.approx(1.0)
    assert pearson([0, 1, 2, 3], [3, 2, 1, 0]) == pytest.approx(-1.0)
    assert pearson([0, 1, 0, 1], [0, 0, 1, 1]) == pytest.approx(0.0)


def test_pearson_is_undefined_when_an_axis_gives_everyone_the_same_score():
    assert pearson([2, 2, 2], [0, 1, 4]) is None


def test_pearson_needs_scores_for_the_same_students():
    with pytest.raises(ValueError):
        pearson([0, 1], [0, 1, 2])


def test_duplicate_pairs_are_axes_correlated_at_or_above_the_threshold():
    by_axis = [
        [0, 1, 2, 3, 4],
        [0, 1, 2, 3, 3],
        [4, 3, 2, 1, 0],
        [2, 2, 2, 2, 2],
        [1, 0, 1, 0, 1],
    ]
    pairs = duplicate_pairs(by_axis, threshold=0.7)
    assert [(a, b) for a, b, _ in pairs] == [(0, 1)]
    assert pairs[0][2] >= 0.7


def test_axis_names_compared_between_two_runs():
    changes = axis_name_changes(["責任", "後果", "同意"], ["後果", "命運", "責任"])
    assert changes == {"same": ["責任", "後果"], "only_before": ["同意"], "only_after": ["命運"]}


def test_identical_runs_have_no_changes():
    changes = axis_name_changes(["甲", "乙"], ["甲", "乙"])
    assert changes == {"same": ["甲", "乙"], "only_before": [], "only_after": []}


def test_score_spread_per_student_and_axis_across_runs():
    runs = [
        {"陳": [1.0, 2.0], "林": [4.0, 0.0]},
        {"陳": [3.0, 2.0], "林": [4.0, 1.0]},
        {"陳": [2.0, 2.0]},
    ]
    assert score_spread(runs) == {"陳": [2.0, 0.0], "林": [0.0, 1.0]}


def test_score_spread_refuses_runs_with_a_different_number_of_axes():
    with pytest.raises(ValueError):
        score_spread([{"陳": [1.0, 2.0]}, {"陳": [1.0, 2.0, 3.0]}])

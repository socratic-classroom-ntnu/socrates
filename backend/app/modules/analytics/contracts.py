"""Response shapes of the teacher analysis projection (`GET /groups/classrooms/{rid}/analysis`)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import Field
from app.modules.platform.contracts import Strict


class StanceOptionView(Strict):
    option_id: str
    text: str
    count: int
    percent: float


class GroupStanceView(Strict):
    """One question run's stance distribution in a group; counts only, no identities."""

    question_index: int
    question_id: str
    question_title: str
    run_id: str
    run_phase: str
    basis: Literal["personal_baseline"]
    members: int
    confirmed: int
    unconfirmed: int
    unconfirmed_by_status: dict[str, int]
    options: list[StanceOptionView]
    differing: bool


class AnalysisPersonView(Strict):
    # id is a classroom-scoped pseudonym; the real username is only behind the identity endpoint.
    id: str
    nickname: str
    confirmed: bool
    confirmation_digest: str | None
    timeline: list[dict[str, Any]]


class AnalysisTreeNodeView(Strict):
    id: str
    parent: str | None
    cross_references: list[dict[str, Any]]


class AnalysisGroupView(Strict):
    id: str
    label: str
    phase: str
    snapshot_id: str
    settlement: dict[str, Any]
    persons: list[AnalysisPersonView]
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    tree_projection: list[AnalysisTreeNodeView]
    roots: list[str]
    stances: list[GroupStanceView]


class ChartSemanticsView(Strict):
    sunburst: str
    sankey: str
    graph: str
    heatmap: str
    timeline: str


class GroupAnalysisView(Strict):
    # `schema` would shadow BaseModel.schema, so the field is renamed and keeps its wire name.
    schema_: Literal["socrates/group-analysis/v1"] = Field(alias="schema")
    classroom_id: str
    title: str
    groups: list[AnalysisGroupView]
    basis: Literal["attributed_original_quotes"]
    identity: Literal["nickname_and_classroom_scoped_pseudonym"]
    chart_semantics: ChartSemanticsView

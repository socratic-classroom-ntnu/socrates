"""Response shapes of the teacher analysis projection (`GET /groups/classrooms/{rid}/analysis`)."""

from __future__ import annotations

from typing import Literal
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


class AnalysisNodeView(Strict):
    """One attributed original quote (a group argument) with its author pseudonymised."""

    id: str
    person_id: str
    nickname: str
    text: str
    at: float
    sequence: int
    stage: str
    question_index: int
    kind: Literal["statement", "post_ack_observation", "confirmed_viewpoint"]
    provenance: Literal["student_original_quote", "student_explicit_confirmation"]
    # Only statements carry a visibility; only confirmed viewpoints carry their digest.
    visibility: Literal["personal", "stage", "group_shared"] | None = None
    summary_digest: str | None = None


class AnalysisEdgeView(Strict):
    source: str
    target: str
    type: Literal["supports", "challenges", "qualifies", "revises"]
    provenance: Literal["student_selected_relation", "confirmation_snapshot"]


class SettlementView(Strict):
    """The group's settlement latch; later states add their fields to the earlier ones."""

    state: Literal["EXPLORING", "CURRENT_PHASE_FINISHING", "FINAL_STAGE", "SETTLED"]
    latched_at: float | None = None
    latched_phase: str | None = None
    final_stage_count: int | None = None
    started_at: float | None = None
    settled_at: float | None = None
    ended_by: Literal["system", "teacher"] | None = None
    end_reason: Literal["final_stage_complete", "teacher_force_end"] | None = None
    incomplete_members: list[str] | None = None
    member_status: dict[str, Literal["confirmed", "incomplete"]] | None = None


class AnalysisPersonView(Strict):
    # id is a classroom-scoped pseudonym; the real username is only behind the identity endpoint.
    id: str
    nickname: str
    confirmed: bool
    confirmation_digest: str | None
    timeline: list[AnalysisNodeView]


class AnalysisTreeNodeView(Strict):
    id: str
    parent: str | None
    cross_references: list[AnalysisEdgeView]


class AnalysisGroupView(Strict):
    id: str
    label: str
    phase: str
    snapshot_id: str
    settlement: SettlementView
    persons: list[AnalysisPersonView]
    nodes: list[AnalysisNodeView]
    edges: list[AnalysisEdgeView]
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

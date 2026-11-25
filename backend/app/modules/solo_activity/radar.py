"""The teacher's radar for one solo activity (NEW-FEATURES 3.4): where each student's final
summary sits on a few dimensions of thinking, for the course owner only.

Two routes give the same RadarView:

- 15 or more students, and the local embedding model is there: each kept final summary's
  ``normalized_text`` is embedded, PCA on those vectors gives up to five axes (each must explain at
  least a tenth of the variance), ``radar_axis_naming`` names each axis from the five students at
  either end, and a student's place on an axis is their standardised projection: 2 at the class
  mean, one point per standard deviation, held within 0 to 4. These scores carry no citations.
- Fewer students, the model missing, or vectors with no spread: ``radar_dimensions`` sets four to
  six dimensions from the activity and the class's anonymous summaries, then ``radar_scoring`` scores each student 0 to 4 on each from
  their final summary and their own words, quoting them; quotes not found verbatim are dropped.

Only completed attempts on the activity's current revision that kept a final summary count. The
result is kept in ``solo_radars`` with a fingerprint of the summaries it came from: reads serve it
until a summary is added or changed, and the next read computes it again (the teacher's axis
names go with it). Provider calls run outside any transaction, like the student's tutor.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import time
from typing import Any

from pydantic import BaseModel

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.modules.ai_providers.contracts import EmbeddingUnavailable
from app.modules.ai_providers.service import embed
from app.modules.solo_activity.tutor_chain import course_bindings
from app.modules.course_management import service as activities
from app.modules.course_management.repositories import ActivityRevision, Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.llm_runtime.contracts import RadarAxisNames, RadarDimensions, RadarScores
from app.modules.llm_runtime.service import compile_program
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction
from app.modules.solo_activity import service
from app.modules.solo_activity.guest_records import student_kinds
from app.modules.solo_activity.repositories import SoloAttempt, SoloRadar

EMBEDDING_MIN_STUDENTS = 15
MAX_AXES = 5
# A radar needs three axes to draw a shape; with fewer the class is scored by the model instead.
MIN_AXES = 3
# An axis must explain this share of the variance between the students' summaries.
MIN_AXIS_SHARE = 0.10
POLE_STUDENTS = 5
MAX_SOURCES = 3
# Scoring calls in flight at once, so a class of 14 does not wait for 14 calls in a row.
SCORING_CONCURRENCY = 4
Doc = dict[str, Any]
AXIS_PROGRAM = "radar_axis_naming"
DIMENSIONS_PROGRAM = "radar_dimensions"
SCORING_PROGRAM = "radar_scoring"


def now() -> float:
    return time.time()


# ---- reading what the radar is made of -----------------------------------------------------


def _owned(
    db: Session, account: Account, activity_id: str
) -> tuple[Any, Course, ActivityRevision | None]:
    activity = activities.get_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    # Students, other teachers and strangers alike: the activity does not exist for them.
    if course is None or course.owner_id != account.id:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    return activity, course, activities.current_revision(db, activity)


def _students(
    db: Session, course: Course, activity_id: str, revision_id: str, at: float
) -> list[Doc]:
    """Each student with a kept final summary on this revision, in joining order."""
    enrolled = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.course_id == course.id, Enrollment.account_id != course.owner_id)
            .order_by(Enrollment.created_at, Enrollment.id)
        )
    )
    attempts = {
        row.account_id: row
        for row in db.scalars(
            select(SoloAttempt).where(
                SoloAttempt.activity_id == activity_id,
                SoloAttempt.revision_id == revision_id,
                SoloAttempt.state == "completed",
            )
        )
    }
    kinds = student_kinds(db, enrolled, at)
    found = []
    for enrollment in enrolled:
        row = attempts.get(enrollment.account_id)
        final = (row.final or {}) if row is not None else {}
        if row is None or final.get("status") is None or final.get("summary") is None:
            continue
        kind = kinds[enrollment.id]
        name = (
            f"匿名訪客 {kind['guest_number']}"
            if kind["kind"] == "expired_guest" or not enrollment.display_name
            else enrollment.display_name
        )
        found.append(
            {
                "student_id": enrollment.id,
                # Whose words these are, for the side record only (never in the stored radar).
                "account_id": enrollment.account_id,
                "display_name": name,
                "attempt_id": row.id,
                "summary": final["summary"],
            }
        )
    return found


def _basis(revision_id: str, students: list[Doc]) -> str:
    material = [revision_id] + [
        [s["attempt_id"], json.dumps(s["summary"], sort_keys=True, ensure_ascii=False)]
        for s in sorted(students, key=lambda s: s["attempt_id"])
    ]
    return hashlib.sha256(json.dumps(material, ensure_ascii=False).encode()).hexdigest()


def _view(row: SoloRadar) -> Doc:
    return {"dimensions": row.dimensions, "students": row.students}


def _activity_context(revision: ActivityRevision, account: Account) -> Doc:
    content = revision.content or {}
    context: dict[str, Any] = {
        "narrative": content.get("narrative") or content.get("title", ""),
        "output_locale": account.locale or service.DEFAULT_LOCALE,
    }
    if content.get("stance_space"):
        context["stances"] = content["stance_space"]
    return context


# ---- the vector route ----------------------------------------------------------------------


def principal_axes(
    vectors: list[list[float]], count: int, min_share: float = 0.0
) -> list[list[float]]:
    """Each student's coordinate on the first ``count`` principal components, largest first.

    A component is kept only while it explains at least ``min_share`` of the class's total
    variance, so a small class with short summaries gets the few axes that carry a difference
    rather than five with the later ones mostly noise.

    PCA through the students' Gram matrix (n×n, n is a class), by power iteration with
    deflation: no numerical library needed. Components with no spread left are not returned, so
    fewer than ``count`` may come back. A component's sign is arbitrary; the axis naming reads
    its two ends from the same coordinates, so the sign never shows.
    """
    n = len(vectors)
    if n < 2:
        return []
    width = len(vectors[0])
    mean = [sum(v[j] for v in vectors) / n for j in range(width)]
    centred = [[v[j] - mean[j] for j in range(width)] for v in vectors]
    gram = [[sum(a * b for a, b in zip(x, y)) for y in centred] for x in centred]
    total = sum(gram[i][i] for i in range(n))
    if total <= 0:
        return []
    found: list[tuple[float, list[float]]] = []
    for _ in range(min(count, n - 1)):
        # Start from the student farthest from the mean: never orthogonal to the largest
        # remaining component, which a fixed start vector can be (it then finds a small one).
        far = max(range(n), key=lambda i: gram[i][i])
        if gram[far][far] <= 1e-9 * total:
            break
        u = [x / math.sqrt(sum(y * y for y in gram[far])) for x in gram[far]]
        for _ in range(1000):
            w = [sum(gram[i][j] * u[j] for j in range(n)) for i in range(n)]
            size = math.sqrt(sum(x * x for x in w))
            if size == 0:
                break
            nxt = [x / size for x in w]
            done = max(abs(a - b) for a, b in zip(nxt, u)) < 1e-12
            u = nxt
            if done:
                break
        value = sum(u[i] * sum(gram[i][j] * u[j] for j in range(n)) for i in range(n))
        if value <= 1e-9 * total:
            break
        found.append((value, [x * math.sqrt(value) for x in u]))
        gram = [[gram[i][j] - value * u[i] * u[j] for j in range(n)] for i in range(n)]
    found.sort(key=lambda pair: -pair[0])
    return [axis for value, axis in found if value >= min_share * total]


def standard_scores(values: list[float]) -> list[float]:
    """0 to 4 from each student's distance to the class mean, in standard deviations.

    2 is the class mean and each standard deviation moves one point, held within 0 to 4, so
    a class split in two shows as two clusters and a class of near-agreement stays near 2.
    """
    n = len(values)
    mean = sum(values) / n
    spread = math.sqrt(sum((v - mean) ** 2 for v in values) / n)
    if spread == 0:
        return [2.0] * n
    return [round(min(4.0, max(0.0, 2 + (v - mean) / spread)), 2) for v in values]


def _pole_text(summary: Doc) -> str:
    return f"{summary['final_position']}\n{summary['reasoning_style']}"


async def _vector_route(prepared: Doc) -> tuple[list[Doc], list[Doc]] | None:
    """(dimensions, students) from embeddings, or None to fall back to the scoring route."""
    students = prepared["students"]
    try:
        vectors = await run_in_threadpool(
            embed, [s["summary"]["normalized_text"] for s in students]
        )
    except EmbeddingUnavailable:
        return None
    axes = principal_axes(vectors, MAX_AXES, MIN_AXIS_SHARE)
    if len(axes) < MIN_AXES:
        return None
    context = {
        **prepared["activity_context"],
        "axes": [
            {
                "axis_index": index,
                "low_end": [
                    _pole_text(students[i]["summary"])
                    for i in sorted(range(len(students)), key=lambda i: axis[i])[:POLE_STUDENTS]
                ],
                "high_end": [
                    _pole_text(students[i]["summary"])
                    for i in sorted(range(len(students)), key=lambda i: -axis[i])[:POLE_STUDENTS]
                ],
            }
            for index, axis in enumerate(axes)
        ],
    }
    named = await _call(prepared, AXIS_PROGRAM, RadarAxisNames, context, "solo.radar_axis_naming")
    if named is None:
        return None
    by_index = {axis.axis_index: axis for axis in named.axes}
    if set(by_index) != set(range(len(axes))):
        return None
    dimensions = [
        {
            "index": index,
            "name": by_index[index].name,
            "low_pole": by_index[index].low_pole,
            "high_pole": by_index[index].high_pole,
            "source": "embedding",
        }
        for index in range(len(axes))
    ]
    scored = [standard_scores(axis) for axis in axes]
    return dimensions, [
        {
            "student_id": s["student_id"],
            "display_name": s["display_name"],
            "scores": [
                {"dimension_index": index, "score": scored[index][number], "sources": []}
                for index in range(len(axes))
            ],
        }
        for number, s in enumerate(students)
    ]


# ---- the scoring route ---------------------------------------------------------------------


async def _scoring_route(prepared: Doc) -> tuple[list[Doc], list[Doc]] | None:
    """(dimensions, students) from the model; students it could not score are left out."""
    # The class's own reasoning, so the dimensions split these students instead of restating one
    # contrast from the activity text. Anonymous and sorted: no names, no order to read into.
    context = {
        **prepared["activity_context"],
        "summaries": sorted(_pole_text(s["summary"]) for s in prepared["students"]),
    }
    defined = await _call(
        prepared, DIMENSIONS_PROGRAM, RadarDimensions, context, "solo.radar_dimensions"
    )
    if defined is None:
        return None
    dimensions = [
        {
            "index": index,
            "name": d.name,
            "low_pole": d.low_pole,
            "high_pole": d.high_pole,
            "source": "llm",
        }
        for index, d in enumerate(defined.dimensions)
    ]
    for_model = [
        {
            "dimension_index": d["index"],
            "name": d["name"],
            "low_pole": d["low_pole"],
            "high_pole": d["high_pole"],
        }
        for d in dimensions
    ]
    gate = asyncio.Semaphore(SCORING_CONCURRENCY)

    async def score(student: Doc) -> Doc | None:
        context = {
            "dimensions": for_model,
            "final_summary": service._for_model(student["summary"]),
            "student_messages": [{"ref": ref, "text": text} for ref, (_, text) in student["refs"]],
        }
        async with gate:
            result = await _call(
                prepared,
                SCORING_PROGRAM,
                RadarScores,
                context,
                "solo.radar_scoring",
                about=[student["account_id"]],
            )
        if result is None:
            return None
        by_index = {s.dimension_index: s for s in result.scores}
        if set(by_index) != set(range(len(dimensions))):
            return None
        texts = dict(student["refs"])
        return {
            "student_id": student["student_id"],
            "display_name": student["display_name"],
            "scores": [
                {
                    "dimension_index": index,
                    "score": float(by_index[index].score),
                    "sources": service._located(by_index[index].sources, texts)[:MAX_SOURCES],
                }
                for index in range(len(dimensions))
            ],
        }

    scored = await asyncio.gather(*(score(s) for s in prepared["students"]))
    students = [s for s in scored if s is not None]
    if not students:
        return None
    return dimensions, students


async def _call(
    prepared: Doc,
    kind: str,
    schema: type[BaseModel],
    context: Doc,
    endpoint: str,
    about: list[str] | None = None,
) -> Any:
    """One program through the owner's bindings; the validated result, or None. ``about``: whose
    words the context carries (default: every student in the run), so the side record of the
    call is deleted with any of them."""
    with transaction() as db:
        messages, compiled, _ = compile_program(db, kind, context)
    called = await service._call_program(
        {
            "account_id": prepared["account_id"],
            "bindings": prepared["bindings"],
            "messages": messages,
            "schema": compiled,
            "context": context,
            "about": about
            if about is not None
            else [s["account_id"] for s in prepared["students"]],
        },
        kind,
        schema,
        endpoint,
    )
    return None if called is None else called[0]


# ---- the two endpoints ---------------------------------------------------------------------


def begin_radar(db: Session, account: Account, activity_id: str, at: float) -> Doc:
    """The kept radar when it is current, or what computing it needs."""
    activity, course, revision = _owned(db, account, activity_id)
    students = _students(db, course, activity.id, revision.id, at) if revision else []
    if revision is None or not students:
        raise DomainError("RADAR_NOT_READY", 409)
    basis = _basis(revision.id, students)
    kept = db.get(SoloRadar, activity.id)
    if kept is not None and kept.basis == basis:
        return {"view": _view(kept)}
    bindings = course_bindings(db, course, service.ROLE)
    if not bindings:
        raise DomainError("RADAR_NOT_READY", 409)
    for student in students:
        said = [m for m in service._messages(db, student["attempt_id"]) if m.role == "student"]
        # The same refs the final summary quoted by: m1, m2, … over all the student's words.
        student["refs"] = [(f"m{number}", (m.id, m.text)) for number, m in enumerate(said, start=1)]
    return {
        "activity_id": activity.id,
        "account_id": account.id,
        "basis": basis,
        "bindings": bindings,
        "students": students,
        "activity_context": _activity_context(revision, account),
    }


async def finish_radar(prepared: Doc) -> Doc:
    if "view" in prepared:
        return dict(prepared["view"])
    computed = None
    if len(prepared["students"]) >= EMBEDDING_MIN_STUDENTS:
        computed = await _vector_route(prepared)
    if computed is None:
        computed = await _scoring_route(prepared)
    if computed is None:
        raise DomainError("RADAR_NOT_READY", 409)
    dimensions, students = computed
    with transaction() as db:
        row = db.get(SoloRadar, prepared["activity_id"], with_for_update=True)
        if row is None:
            row = SoloRadar(activity_id=prepared["activity_id"])
            db.add(row)
        row.basis = prepared["basis"]
        row.dimensions = dimensions
        row.students = students
        row.computed_at = now()
        return _view(row)


def rename_dimension(db: Session, account: Account, activity_id: str, index: int, name: str) -> Doc:
    """The teacher's name for one dimension of the kept radar."""
    activity, _, _ = _owned(db, account, activity_id)
    row = db.get(SoloRadar, activity.id, with_for_update=True)
    if row is None:
        raise DomainError("RADAR_NOT_READY", 409)
    if not 0 <= index < len(row.dimensions):
        raise DomainError("RADAR_DIMENSION_NOT_FOUND", 404)
    dimensions = [dict(d) for d in row.dimensions]
    dimensions[index]["name"] = name
    row.dimensions = dimensions
    return _view(row)

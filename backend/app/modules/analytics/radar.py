"""The teacher's radar for one question of a grouped classroom, in the solo activity's RadarView.

One radar per question, across every group of the classroom. A student counts once they have
confirmed their personal baseline on that question (``personal_confirm``): the position, reason
and conditions they agreed to stand for the solo activity's kept final summary, and their own
words in the personal follow-up are what quotes point to. AI students are left out.

The two routes are the solo activity's (NEW-FEATURES 3.4):

- 15 or more students, and the local embedding model is there: PCA on the baselines' vectors,
  up to five axes that each explain at least a tenth of the variance, named by
  ``radar_axis_naming``; a student's score is the standardised projection (2 at the class mean,
  one point per standard deviation, held within 0 to 4). No citations.
- Otherwise ``radar_dimensions`` sets four to six dimensions from the question and
  ``radar_scoring`` scores each student 0 to 4 with quotes from their own words.

Nothing is kept: every read computes the radar again. Provider calls run outside any
transaction.
"""

from __future__ import annotations

import asyncio
import math
import time
from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.modules.ai_providers.contracts import EmbeddingUnavailable
from app.modules.ai_providers.service import embed, record_direct_call_audit
from app.modules.analytics.group_analysis import pseudonym
from app.modules.classroom_core.repositories import Room
from app.modules.classroom_core.service import room_provider_chain
from app.modules.llm_runtime.contracts import (
    Citation,
    RadarAxisNames,
    RadarDimensions,
    RadarScores,
)
from app.modules.llm_runtime.service import compile_program, guarded_generate, locate_citation
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction
from app.modules.solo_activity.service import DEFAULT_LOCALE, PROVIDER_TIMEOUT_SECONDS

EMBEDDING_MIN_STUDENTS = 15
MAX_AXES = 5
MIN_AXIS_SHARE = 0.10
POLE_STUDENTS = 5
MAX_SOURCES = 3
SCORING_CONCURRENCY = 4
DISPLAY_NAME_MAX = 64
# The group personal tutor's role: the classroom's model for talking with one student.
PROVIDER_JOB = "personal_tutor"
ROLE = "socratic_tutor"
AXIS_PROGRAM = "radar_axis_naming"
DIMENSIONS_PROGRAM = "radar_dimensions"
SCORING_PROGRAM = "radar_scoring"
Doc = dict[str, Any]


# ---- reading what the radar is made of -----------------------------------------------------


def _question(rooms: list[Room], index: int) -> Doc:
    for room in rooms:
        questions = room.state.get("questions", [])
        if 0 <= index < len(questions):
            question: Doc = questions[index]
            return question
    raise DomainError("QUESTION_REQUIRED", 404)


def _students(classroom_id: str, rooms: list[Room], index: int) -> list[Doc]:
    """Each human student with a confirmed baseline on this question, group by group, in seat order."""
    found = []
    for room in rooms:
        state = room.state
        runs = state.get("runs", [])
        if index >= len(runs):
            continue
        run = runs[index]
        personal = run.get("personal", {})
        for member_id in state["group"]["member_snapshot"]:
            member = state["members"].get(member_id, {})
            entry = personal.get(member_id)
            baseline = (entry or {}).get("baseline")
            # AI students' baselines come from their answer (source "ai_student"), not a confirmation.
            if baseline is None or baseline.get("source") != "student_confirmed":
                continue
            student_id = pseudonym(classroom_id, member_id)
            said = [m["text"] for m in entry["messages"] if m["role"] == "student"]
            found.append(
                {
                    "student_id": student_id,
                    "display_name": (member.get("alias") or "同學")[:DISPLAY_NAME_MAX],
                    "baseline": {
                        "current_position": baseline["position"],
                        "reason_summary": baseline["reason_summary"],
                        "relevant_conditions": list(baseline["conditions"]),
                    },
                    # m1, m2, … over the student's own words in the follow-up; the id stays
                    # within this payload: the run, the student's pseudonym and the turn.
                    "refs": [
                        (f"m{number}", (f"{run['id']}:{student_id}:{number}", text))
                        for number, text in enumerate(said, start=1)
                    ],
                }
            )
    return found


def _text(baseline: Doc) -> str:
    conditions = "；".join(baseline["relevant_conditions"])
    return "。".join(
        part
        for part in (baseline["current_position"], baseline["reason_summary"], conditions)
        if part
    )


def begin_radar(db: Session, account: Any, room: Room, rooms: list[Room], index: int) -> Doc:
    """What computing this question's radar needs, read inside the caller's transaction."""
    question = _question(rooms, index)
    students = _students(room.id, rooms, index)
    if not students:
        raise DomainError("RADAR_NOT_READY", 409)
    bindings, _ = room_provider_chain(db, room, PROVIDER_JOB, {})
    if not bindings:
        raise DomainError("RADAR_NOT_READY", 409)
    context: Doc = {
        "narrative": "\n".join(
            part for part in (question.get("title", ""), question.get("scenario", "")) if part
        ),
        "output_locale": account.locale or DEFAULT_LOCALE,
    }
    if question.get("options"):
        context["stances"] = [option["text"] for option in question["options"]]
    return {
        "account_id": account.id,
        "bindings": bindings,
        "students": students,
        "question_context": context,
    }


# ---- the vector route ----------------------------------------------------------------------


def principal_axes(
    vectors: list[list[float]], count: int, min_share: float = 0.0
) -> list[list[float]]:
    """Each student's coordinate on the first ``count`` principal components, largest first.

    The solo activity's method: PCA through the students' Gram matrix by power iteration with
    deflation, keeping a component only while it explains at least ``min_share`` of the total
    variance. Components with no spread left are not returned.
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
        # remaining component.
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
    """0 to 4: 2 is the class mean and each standard deviation moves one point."""
    n = len(values)
    mean = sum(values) / n
    spread = math.sqrt(sum((v - mean) ** 2 for v in values) / n)
    if spread == 0:
        return [2.0] * n
    return [round(min(4.0, max(0.0, 2 + (v - mean) / spread)), 2) for v in values]


async def _vector_route(prepared: Doc) -> tuple[list[Doc], list[Doc]] | None:
    """(dimensions, students) from embeddings, or None to fall back to the scoring route."""
    students = prepared["students"]
    texts = [_text(s["baseline"]) for s in students]
    try:
        vectors = await run_in_threadpool(embed, texts)
    except EmbeddingUnavailable:
        return None
    axes = principal_axes(vectors, MAX_AXES, MIN_AXIS_SHARE)
    if not axes:
        return None
    context = {
        **prepared["question_context"],
        "axes": [
            {
                "axis_index": index,
                "low_end": [
                    texts[i]
                    for i in sorted(range(len(students)), key=lambda i: axis[i])[:POLE_STUDENTS]
                ],
                "high_end": [
                    texts[i]
                    for i in sorted(range(len(students)), key=lambda i: -axis[i])[:POLE_STUDENTS]
                ],
            }
            for index, axis in enumerate(axes)
        ],
    }
    named = await _call(prepared, AXIS_PROGRAM, RadarAxisNames, context)
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


def _located(citations: list[Citation], texts: dict[str, tuple[str, str]]) -> list[Doc]:
    located = []
    for citation in citations:
        message = texts.get(citation.message_ref)
        if message is None:
            continue
        found = locate_citation(Citation.model_validate(citation), message[0], message[1])
        if found is not None:
            located.append(found.model_dump())
    return located[:MAX_SOURCES]


async def _scoring_route(prepared: Doc) -> tuple[list[Doc], list[Doc]] | None:
    """(dimensions, students) from the model; students it could not score are left out."""
    defined = await _call(
        prepared, DIMENSIONS_PROGRAM, RadarDimensions, prepared["question_context"]
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
            "final_summary": student["baseline"],
            "student_messages": [{"ref": ref, "text": text} for ref, (_, text) in student["refs"]],
        }
        async with gate:
            result = await _call(prepared, SCORING_PROGRAM, RadarScores, context)
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
                    "sources": _located(by_index[index].sources, texts),
                }
                for index in range(len(dimensions))
            ],
        }

    scored = await asyncio.gather(*(score(s) for s in prepared["students"]))
    students = [s for s in scored if s is not None]
    if not students:
        return None
    return dimensions, students


async def _call(prepared: Doc, kind: str, schema: type[BaseModel], context: Doc) -> Any:
    """One program through the classroom's bindings in order, every attempt audited; the
    validated result, or None when none of them gave a usable one."""
    with transaction() as db:
        messages, compiled, _ = compile_program(db, kind, context)
    endpoint = f"analytics.{kind}"

    async def no_delta(_: str) -> None:
        return None

    for binding in prepared["bindings"]:
        started = time.monotonic()
        try:
            result, audit = await asyncio.wait_for(
                guarded_generate(binding, messages, compiled, no_delta, kind=kind, context=context),
                PROVIDER_TIMEOUT_SECONDS,
            )
            validated = schema.model_validate(result)
        except Exception as exc:  # noqa: BLE001 — a failed binding is a missing result
            reason = (
                getattr(exc, "reason", None)
                or getattr(exc, "code", None)
                or ("PROVIDER_TIMEOUT" if isinstance(exc, TimeoutError) else type(exc).__name__)
            )
            record_direct_call_audit(
                actor_id=prepared["account_id"],
                endpoint=endpoint,
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=str(reason),
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            continue
        record_direct_call_audit(
            actor_id=prepared["account_id"],
            endpoint=endpoint,
            role=ROLE,
            binding=binding,
            state="READY",
            audit=audit,
        )
        return validated
    return None


async def finish_radar(prepared: Doc) -> Doc:
    computed = None
    if len(prepared["students"]) >= EMBEDDING_MIN_STUDENTS:
        computed = await _vector_route(prepared)
    if computed is None:
        computed = await _scoring_route(prepared)
    if computed is None:
        raise DomainError("RADAR_NOT_READY", 409)
    dimensions, students = computed
    return {"dimensions": dimensions, "students": students}

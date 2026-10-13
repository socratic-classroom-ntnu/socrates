"""Repo-versioned templates/skills + DB program metadata, shared by every LLM use case."""

import json
from pathlib import Path
from app.modules.llm_runtime.contracts import (
    DynamicResult,
    LLMStudentTurn,
    PersonalTutorTurn,
    ScriptAssistResult,
    SummaryResult,
    TutorTurn,
)
from app.repositories.classroom_storage import Program, digest
from app.tutor import iron_rules

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = {
    "TutorTurn": TutorTurn,
    "PersonalTutorTurn": PersonalTutorTurn,
    "SummaryResult": SummaryResult,
    "DynamicResult": DynamicResult,
    "LLMStudentTurn": LLMStudentTurn,
    "ScriptAssistResult": ScriptAssistResult,
}


JOB_KINDS = (
    "focused_tutor",
    "personal_tutor",
    "dynamic_question",
    "question_summary",
    "class_summary",
    "personal_summary",
    "llm_student_turn",
)
# Request-time programs (no classroom job); same file, same validation.
REQUEST_PROGRAMS = ("ai_script_authoring",)
# L0 路由；compile_program 依角色載入 L1＋L2（app/tutor/iron_rules.py）。
IRON_RULES_SKILL = "iron-rules/ROUTER.json"


def validate_programs() -> None:
    """Fail at startup on broken prompt definitions, like a broken ladder (AGENTS.md).

    Without this, a broken programs.json makes every job fall back silently while the
    classroom still looks alive.
    """
    path = ROOT / "prompts/classroom/programs.json"
    try:
        spec = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"{path} is unreadable: {exc}") from exc
    if not isinstance(spec, dict):
        raise RuntimeError(f"{path} must be a JSON object")
    for key in ("version", "skill_set_version", "skills", "programs"):
        if key not in spec:
            raise RuntimeError(f"{path} is missing {key!r}")
    programs = spec["programs"]
    if not isinstance(programs, dict):
        raise RuntimeError(f"{path}: 'programs' must be an object")
    for kind in (*JOB_KINDS, *REQUEST_PROGRAMS):
        entry = programs.get(kind)
        if not isinstance(entry, dict):
            raise RuntimeError(f"{path} has no program for {kind!r}")
        if entry.get("schema") not in SCHEMAS:
            raise RuntimeError(f"{path}: {kind!r} uses unknown schema {entry.get('schema')!r}")
        template = entry.get("template")
        if not isinstance(template, str) or not template.strip():
            raise RuntimeError(f"{path}: {kind!r} needs a non-empty template")
    if not isinstance(spec["skills"], list):
        raise RuntimeError(f"{path}: 'skills' must be a list")
    # 鐵則必須存在且排第一：每個 program 的 system prompt 都以它開頭（docs/IRON-RULES.md）。
    if not spec["skills"] or spec["skills"][0] != IRON_RULES_SKILL:
        raise RuntimeError(f"{path}: 'skills' must start with {IRON_RULES_SKILL!r}")
    iron_rules.validate((*JOB_KINDS, *REQUEST_PROGRAMS, *iron_rules.DIRECT_ROLES), root=ROOT)
    for name in spec["skills"]:
        if not (ROOT / "skills/classroom" / str(name)).is_file():
            raise RuntimeError(f"skill file skills/classroom/{name} does not exist")


def compile_program(db, kind, context):
    program_path = ROOT / "prompts/classroom/programs.json"
    spec = json.loads(program_path.read_text())
    entry = spec["programs"][kind]
    # 鐵則：L0 路由決定這個角色載入哪個 L2，接在 L1 共通後面；其他 skill 照列表接在後面。
    skill_text = "\n\n".join(
        iron_rules.rules_for(kind, root=ROOT)
        if p == IRON_RULES_SKILL
        else (ROOT / "skills/classroom" / p).read_text()
        for p in spec["skills"]
    )
    metadata = {
        "prompt_program_version": spec["version"],
        "skill_set_version": spec["skill_set_version"],
        "template_hash": digest(entry),
        "skill_hash": digest(skill_text),
        "output_schema_version": "classroom.v1",
        "context_hash": digest(context),
        "use_case": kind,
    }
    key = kind + ":" + digest(metadata)[:24]
    # Context-specific hash stays in call audit, not canonical program identity.
    canonical = {k: v for k, v in metadata.items() if k != "context_hash"}
    key = kind + ":" + digest(canonical)[:24]
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sq_insert

    ins = pg_insert if db.bind.dialect.name == "postgresql" else sq_insert
    db.execute(
        ins(Program)
        .values(id=key, metadata_json=canonical)
        .on_conflict_do_nothing(index_elements=[Program.id])
    )
    return (
        [
            {"role": "system", "content": skill_text + "\n\n" + entry["template"]},
            {
                "role": "user",
                # Routing (scenario_ai) selects the provider; it is not prompt content.
                "content": json.dumps(
                    {k: v for k, v in context.items() if k != "scenario_ai"},
                    ensure_ascii=False,
                ),
            },
        ],
        SCHEMAS[entry["schema"]],
        metadata,
    )

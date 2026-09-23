"""Repo-versioned templates/skills + DB program metadata, shared by every LLM use case."""

import json
from pathlib import Path
from .contracts import TutorTurn, SummaryResult, DynamicResult
from .storage import Program, digest

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = {"TutorTurn": TutorTurn, "SummaryResult": SummaryResult, "DynamicResult": DynamicResult}


def compile_program(db, kind, context):
    program_path = ROOT / "prompts/run2/programs.json"
    spec = json.loads(program_path.read_text())
    entry = spec["programs"][kind]
    skill_text = "\n\n".join((ROOT / "skills/run2" / p).read_text() for p in spec["skills"])
    metadata = {
        "prompt_program_version": spec["version"],
        "skill_set_version": spec["skill_set_version"],
        "template_hash": digest(entry),
        "skill_hash": digest(skill_text),
        "output_schema_version": "run2.v1",
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
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ],
        SCHEMAS[entry["schema"]],
        metadata,
    )

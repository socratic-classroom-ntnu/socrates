"""A program's stored identity depends on its template and skills, never on the call's context."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.llm_runtime import prompts
from app.modules.llm_runtime.repositories import Program
from app.modules.platform import storage


def test_two_contexts_share_one_program_row():
    engine = storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with Session(engine) as db:
        _, _, first = prompts.compile_program(db, "solo_tutor", {"answer": "我會拉"})
        _, _, second = prompts.compile_program(db, "solo_tutor", {"answer": "我不會拉"})
        assert first["context_hash"] != second["context_hash"]
        rows = db.scalars(select(Program)).all()
    assert len(rows) == 1 and rows[0].id.startswith("solo_tutor:")
    assert "context_hash" not in rows[0].metadata_json

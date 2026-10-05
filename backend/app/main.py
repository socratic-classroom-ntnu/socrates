import datetime as dt
import os
import subprocess

from fastapi import FastAPI

from app.api.routes import history, messages, room, sessions, summaries, transcripts
from app.api.schemas import ReleaseView
from app.config import settings
from app.ladders.repository import LadderRepository

ladder_repository = LadderRepository.load(settings.ladder_path)

app = FastAPI(title="Socrates API", version="0.2.0")

app.include_router(sessions.router)
app.include_router(messages.router)
app.include_router(summaries.router)
app.include_router(history.router)
app.include_router(room.router)
app.include_router(transcripts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _source_sha() -> str:
    configured = os.environ.get("SOCRATES_SOURCE_SHA")
    if configured:
        return configured
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, timeout=2).strip()
    except Exception:
        return "local-worktree"


@app.get("/api/release", response_model=ReleaseView)
def release() -> ReleaseView:
    source_sha = _source_sha()
    return ReleaseView(
        release_id=os.environ.get("SOCRATES_RELEASE_ID", f"socrates-{source_sha[:12]}"),
        source_sha=source_sha,
        environment=os.environ.get("SOCRATES_ENVIRONMENT", "local-dev"),
        alembic_revision=os.environ.get("SOCRATES_ALEMBIC_REVISION", "head"),
        built_at=os.environ.get("SOCRATES_BUILT_AT", dt.datetime.now(dt.timezone.utc).isoformat()),
    )

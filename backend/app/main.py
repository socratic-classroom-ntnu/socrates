import datetime as dt
import os

from fastapi import FastAPI

from app.modules.app_shell.contracts import ReleaseView
from app.modules.content_authoring.service import LadderRepository
from app.modules.platform.config import settings
from app.modules.platform.release import release_snapshot

# A broken ladder file must stop the service from starting (AGENTS.md); script_assist reads its
# stages as sample questions.
ladder_repository = LadderRepository.load(settings.ladder_path)

app = FastAPI(title="Socrates API", version="0.2.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/release", response_model=ReleaseView)
def release() -> ReleaseView:
    release_id, source_sha = release_snapshot()
    return ReleaseView(
        release_id=release_id,
        source_sha=source_sha,
        environment=os.environ.get("SOCRATES_ENVIRONMENT", "local-dev"),
        alembic_revision=os.environ.get("SOCRATES_ALEMBIC_REVISION", "head"),
        built_at=os.environ.get("SOCRATES_BUILT_AT", dt.datetime.now(dt.timezone.utc).isoformat()),
    )

"""App Shell response models for the /api routes in app/main.py."""

from pydantic import BaseModel


class ReleaseView(BaseModel):
    release_id: str
    source_sha: str
    environment: str
    alembic_revision: str
    built_at: str

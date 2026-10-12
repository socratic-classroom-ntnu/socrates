"""Explicit public frontend configuration. Provider secrets remain server-side."""

import os
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.classroom_env import env_bool

router = APIRouter()


class PublicConfigView(BaseModel):
    google_cse_id: str
    search_scope: str
    search_state: str
    debug_mode: bool


def debug_mode() -> bool:
    """Single backend authority for development-only product surfaces."""
    return env_bool("SOCRATES_DEBUG_MODE", False)


def require_debug_mode() -> None:
    """Reusable dependency for development-only endpoints; production sees a normal 404."""
    if not debug_mode():
        raise HTTPException(status_code=404, detail="Not Found")


@router.get("/public-config", response_model=PublicConfigView)
def public_config():
    cx = os.environ.get("SOCRATES_GOOGLE_CSE_ID", "").strip()
    valid = bool(re.fullmatch(r"[A-Za-z0-9:_-]{5,160}", cx))
    scope = os.environ.get("SOCRATES_GOOGLE_CSE_SCOPE", "sites")
    return {
        "google_cse_id": cx if valid else "",
        "search_scope": scope if scope in {"sites", "entitled-full-web"} else "sites",
        "search_state": "CONFIGURED" if valid else "AWAITING_SEARCH_ENGINE_BINDING",
        "debug_mode": debug_mode(),
    }

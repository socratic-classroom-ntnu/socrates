"""Explicit public search configuration. Provider secrets remain server-side."""

import os
import re
from fastapi import APIRouter

router = APIRouter()


@router.get("/public-config")
def public_config():
    cx = os.environ.get("SOCRATES_GOOGLE_CSE_ID", "").strip()
    valid = bool(re.fullmatch(r"[A-Za-z0-9:_-]{5,160}", cx))
    scope = os.environ.get("SOCRATES_GOOGLE_CSE_SCOPE", "sites")
    return {
        "google_cse_id": cx if valid else "",
        "search_scope": scope if scope in {"sites", "entitled-full-web"} else "sites",
        "search_state": "CONFIGURED" if valid else "AWAITING_SEARCH_ENGINE_BINDING",
    }

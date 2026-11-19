"""Explicit public frontend configuration. Provider secrets remain server-side."""

import os
import re

from fastapi import APIRouter

from app.modules.platform.contracts import PublicConfigView
from app.modules.platform.demo import demo_login
from app.modules.platform.service import debug_mode
from app.modules.platform.storage import transaction
from app.modules.platform.toggles import features

router = APIRouter()


def _features() -> dict[str, bool]:
    with transaction() as db:
        return features(db)


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
        "demo_login": demo_login(),
        "features": _features(),
    }

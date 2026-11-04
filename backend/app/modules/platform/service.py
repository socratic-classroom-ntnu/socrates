from fastapi import HTTPException
from app.modules.platform.env import env_bool


def debug_mode() -> bool:
    """Single backend authority for development-only product surfaces."""
    return env_bool("SOCRATES_DEBUG_MODE", False)


def require_debug_mode() -> None:
    """Reusable dependency for development-only endpoints; production sees a normal 404."""
    if not debug_mode():
        raise HTTPException(status_code=404, detail="Not Found")

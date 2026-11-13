"""Environment variables for the classroom app. Only the canonical CLASSROOM_* names are read."""

import os


def env_str(name: str, default: str = "") -> str:
    """Read NAME, or the default when it is not set."""
    return os.environ.get(name, default)


def env_int(name: str, default: int) -> int:
    """Same semantics as int(os.environ.get(name, str(default))): a blank value is an error."""
    return int(env_str(name, str(default)))


def env_bool(name: str, default: bool = False) -> bool:
    """Read an explicit boolean flag; accepted values stay stable across local and deployed runs."""
    raw = env_str(name, "true" if default else "false").strip().casefold()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be one of true/false, 1/0, yes/no, on/off")

"""Environment variables for the classroom app, with the pre-rename spelling as fallback."""

import os

# (new prefix, pre-rename prefix); longer prefixes first so CLASSROOM_AI_* finds PORTAL_AI_*.
_LEGACY_PREFIXES = (("CLASSROOM_AI_", "PORTAL_AI_"), ("CLASSROOM_", "RUN2_"))


def env_str(name: str, default: str = "") -> str:
    """Read NAME, falling back to the pre-rename RUN2_*/PORTAL_AI_* spelling for one release."""
    value = os.environ.get(name)
    if value is not None:
        return value
    for new, old in _LEGACY_PREFIXES:
        if name.startswith(new):
            # Only the first matching prefix: each name had exactly one old spelling.
            legacy = os.environ.get(old + name[len(new) :])
            return default if legacy is None else legacy
    return default


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

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
            legacy = os.environ.get(old + name[len(new) :])
            if legacy is not None:
                return legacy
    return default


def env_int(name: str, default: int) -> int:
    """Same semantics as int(os.environ.get(name, str(default))): a blank value is an error."""
    return int(env_str(name, str(default)))

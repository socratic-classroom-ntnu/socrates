"""Which build is running: the one source for /api/release and anything that records it."""

import os
import subprocess


def source_sha() -> str:
    configured = os.environ.get("SOCRATES_SOURCE_SHA")
    if configured:
        return configured
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, timeout=2).strip()
    except Exception:
        return "local-worktree"


def release_snapshot() -> tuple[str, str]:
    """(release_id, source_sha), exactly as /api/release reports them."""
    sha = source_sha()
    return os.environ.get("SOCRATES_RELEASE_ID", f"socrates-{sha[:12]}"), sha

"""Every path that touches the metadata must resolve r88 -> r97, not only create_all."""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]


def _run(code: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True)


def test_configure_registers_models_even_without_create():
    """The application path: an import chain that registers r88, then configure(create=False).

    Synthetic — it borrows migration 0073's import to get r88 into the metadata, but alembic
    itself never calls configure(). The real alembic path is covered by running
    `alembic upgrade head` against a fresh database (.husky/pre-push, and CI's backend job).
    """
    result = _run(
        "from app.api.routes.classroom_library import ClassroomAssets  # noqa: F401\n"
        "from app.repositories import classroom_storage as storage\n"
        "storage.configure('sqlite://')\n"
        "storage.Base.metadata.sorted_tables\n"
        "print('ok')\n"
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout


def test_register_models_is_callable_on_its_own():
    """It must resolve the metadata on its own, without an engine or a configure() call."""
    result = _run(
        "from app.repositories import classroom_storage as storage\n"
        "storage.register_models()\n"
        "storage.Base.metadata.sorted_tables\n"
        "print('ok')\n"
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout

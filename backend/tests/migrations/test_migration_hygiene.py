"""Migrations must be self-contained DDL, not a projection of the current ORM."""

import ast
import sys
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[2] / "migrations" / "versions"
ALLOWED_ROOTS = {"alembic", "sqlalchemy"}


def _foreign_imports(path: Path) -> list[str]:
    """Anything a migration imports that is neither stdlib nor alembic/sqlalchemy.

    Relative imports count too: a shared migration helper changes over time, so a migration
    that calls one stops being a fixed record.
    """
    hits = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.ImportFrom):
            if node.level:
                hits.append(f"{path.name}:{node.lineno} relative import")
                continue
            root = (node.module or "").split(".")[0]
            if root not in ALLOWED_ROOTS and root not in sys.stdlib_module_names:
                hits.append(f"{path.name}:{node.lineno} from {node.module}")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_ROOTS and root not in sys.stdlib_module_names:
                    hits.append(f"{path.name}:{node.lineno} import {alias.name}")
    return hits


def test_no_migration_imports_application_code():
    """Without app.* a migration cannot reach the ORM, so create_all() can only build what it declares."""
    hits = [hit for path in sorted(VERSIONS.glob("*.py")) for hit in _foreign_imports(path)]
    assert hits == []

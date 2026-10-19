"""Contract entry points: the two OpenAPI documents the frontend types are generated from, and the
scans the contract tests compare against the catalogues in contracts.py."""

import ast
import re
from pathlib import Path
from typing import Any, cast

from fastapi import FastAPI
from fastapi.routing import APIRoute

APP_DIR = Path(__file__).resolve().parents[2]


def classroom_app() -> FastAPI:
    from app.classroom_app import create_app

    return cast(FastAPI, create_app(background=False))


def classroom_openapi() -> dict[str, Any]:
    """/api/v2: source of frontend/classroom-openapi.json and src/contract/classroomTypes.ts."""
    return classroom_app().openapi()


def solo_openapi() -> dict[str, Any]:
    """/api (single dialogue): source of frontend/openapi.json and src/contract/types.ts."""
    from app.main import app

    return app.openapi()


def routes_without_response_model(app: FastAPI) -> list[str]:
    return [
        f"{sorted(route.methods)[0]} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute) and route.response_model is None
    ]


def raised_reason_codes() -> dict[str, set[str]]:
    """Every literal DomainError code in the backend, by the module that raises it."""
    found: dict[str, set[str]] = {}
    for path in APP_DIR.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        parts = path.relative_to(APP_DIR).parts
        module = parts[1] if parts[0] == "modules" and len(parts) > 2 else "app_shell"
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            name = getattr(node.func, "id", getattr(node.func, "attr", ""))
            first = node.args[0]
            if (
                name == "DomainError"
                and isinstance(first, ast.Constant)
                and isinstance(first.value, str)
            ):
                if re.fullmatch(r"[A-Z0-9_]+", first.value):
                    found.setdefault(first.value, set()).add(module)
    return found

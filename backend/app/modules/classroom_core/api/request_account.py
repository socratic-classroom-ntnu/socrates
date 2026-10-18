"""Shared request authentication helpers for classroom HTTP adapters."""

import os

from app.modules.classroom_core.orchestrator.classroom import DomainError
from app.modules.identity_access.services import classroom_auth as auth


def same_origin(request) -> None:
    origin = request.headers.get("origin")
    allow = {
        value.rstrip("/")
        for value in os.environ.get(
            "SOCRATES_ALLOWED_ORIGINS",
            os.environ.get("SOCRATES_PUBLIC_ORIGIN", "http://127.0.0.1:8080"),
        ).split(",")
    }
    if origin and origin.rstrip("/") not in allow:
        raise DomainError("ORIGIN_BINDING_REQUIRED", 403)


def account(db, request, mutation=False, verified=True):
    if mutation:
        same_origin(request)
    return auth.identity(
        db,
        request.cookies.get(auth.COOKIE),
        request.headers.get("x-csrf-token"),
        mutation,
        verified,
    )

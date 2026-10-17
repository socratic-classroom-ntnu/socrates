"""HTTP identity dependencies shared by authenticated modules."""

import os
from typing import Any

from fastapi import Request, Response, WebSocket
from sqlalchemy.orm import Session

from app.classroom_env import env_str
from app.modules.platform.errors import DomainError
from app.modules.platform.rate_limit import enforce_rate_limit
from app.repositories.classroom_storage import transaction
from app.services import classroom_auth as auth


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        auth.COOKIE,
        token,
        httponly=True,
        secure=env_str("CLASSROOM_COOKIE_SECURE", "true") == "true",
        samesite="lax",
        max_age=43200,
        path="/",
    )


def same_origin(request: Request | WebSocket) -> None:
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


def account(db: Session, request: Request, mutation: bool = False, verified: bool = True) -> Any:
    if mutation:
        same_origin(request)
    return auth.identity(
        db,
        request.cookies.get(auth.COOKIE),
        request.headers.get("x-csrf-token"),
        mutation,
        verified,
    )


def auth_limit(request: Request, kind: str) -> None:
    same_origin(request)
    host = request.client.host if request.client else "unknown"
    with transaction() as db:
        enforce_rate_limit(db, "auth:" + kind + ":" + host, 300, 60)

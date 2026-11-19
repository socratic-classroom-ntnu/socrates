"""What the scripts share: the running backend's API, accounts, and where results are kept.

Runs inside the backend container (see README): the API is the uvicorn next to it, and the database
is the one the app uses, so direct writes and API reads see the same rows.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select

from app.modules.app_shell import models as _models  # noqa: F401  every module's ORM, as the app
from app.modules.app_shell import wiring as _wiring  # noqa: F401  the app's cross-module hooks
from app.modules.identity_access.repositories import Mail, MailDelivery
from app.modules.platform import storage

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
RUNS = HERE / "runs"
CLASS_FILE = HERE / "local" / "class.json"
FINALS_FILE = DATA / "final_summaries.json"
KEY_FILE = HERE / "local" / "openrouter.key"
BASE_URL = "http://localhost:8000"
PASSWORD = "Radar-Eval-2026!"
TEACHER = "radar_teacher"
MODEL = "anthropic/claude-haiku-5.5"
SESSION_COOKIE = "socrates_session"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_key() -> str:
    """The OpenRouter key, kept out of the repo; never printed."""
    if not KEY_FILE.exists():
        raise SystemExit(f"put the OpenRouter key in {KEY_FILE} (one line)")
    return KEY_FILE.read_text(encoding="utf-8").strip()


def ok(response: httpx.Response) -> Any:
    if response.status_code >= 400:
        raise RuntimeError(f"{response.request.method} {response.request.url}: {response.text}")
    return response.json()


class Api:
    """One logged-in browser: session cookie plus the CSRF header the app wants on writes."""

    def __init__(self) -> None:
        self.http = httpx.Client(base_url=BASE_URL, timeout=600)

    def login(self, username: str) -> Api:
        response = self.http.post(
            "/api/v2/auth/login", json={"login": username, "password": PASSWORD}
        )
        self.http.headers["X-CSRF-Token"] = ok(response)["csrf_token"]
        # The session cookie is Secure; a browser still sends it to localhost, httpx does not.
        self.http.headers["Cookie"] = f"{SESSION_COOKIE}={response.cookies[SESSION_COOKIE]}"
        return self

    def register(self, username: str, role: str = "student") -> Api:
        """A verified account, logged in; one that already exists is only logged in."""
        body = {
            "username": username,
            "email": f"{username}@example.org",
            "password": PASSWORD,
            "account_role": role,
        }
        response = self.http.post("/api/v2/auth/register", json=body)
        if response.status_code not in (200, 409):
            ok(response)
        # A 409 may be an account left unverified by an earlier run; verifying twice is harmless.
        verified = self.http.post("/api/v2/auth/verify", json={"token": _verify_token(username)})
        if response.status_code == 200:
            ok(verified)
        return self.login(username)

    def get(self, path: str, **kwargs: Any) -> Any:
        return ok(self.http.get(path, **kwargs))

    def post(self, path: str, **kwargs: Any) -> Any:
        return ok(self.http.post(path, **kwargs))

    def put(self, path: str, **kwargs: Any) -> Any:
        return ok(self.http.put(path, **kwargs))


def _verify_token(username: str) -> str:
    """The verification link the app mailed; locally the fixture sender keeps it as a preview URL,
    and the queued body is blanked once delivered."""
    with storage.transaction() as db:
        rows = db.execute(
            select(Mail.body, MailDelivery.preview_url)
            .outerjoin(MailDelivery, MailDelivery.mail_id == Mail.id)
            .where(Mail.recipient == f"{username}@example.org")
        )
        for body, preview in reversed(list(rows)):
            found = re.search(r"verify_token=([\w-]+)", f"{body} {preview}")
            if found:
                return found[1]
    raise RuntimeError(f"no verification mail for {username}")

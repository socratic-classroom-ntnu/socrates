#!/usr/bin/env python3
"""Factory accounts for PR preview environments (deploy/preview/README.md).

Every preview gets its own empty database, so the backend runs this once after
`alembic upgrade head`. It creates the same predictable people every time:

    teacher001..teacher003   each owns a script and a lobby room (code PREVIEW1..3)
    user001..user030         students; user001..user010 already sit in PREVIEW1

All passwords are PREVIEW_PASSWORD and every account is already verified, so no
mail is ever needed. Safe to re-run: it does nothing once teacher001 exists.

Refuses to run unless SOCRATES_ENVIRONMENT is explicitly preview or local-dev
(unset fails too), so a mistyped DATABASE_URL can never plant known passwords
in stage or production.
"""

import os
import sys
from pathlib import Path

# In the image the backend lives at /app and this file at /data/scripts; in a
# checkout it is ../backend. PYTHONPATH wins when set.
for candidate in (Path(__file__).resolve().parents[1] / "backend", Path("/app")):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

from sqlalchemy import select  # noqa: E402

from app.api.classroom_schemas import JoinRoom, ScriptDocument  # noqa: E402
from app.modules.platform.repositories import classroom_storage as storage  # noqa: E402
from app.services import classroom as service  # noqa: E402
from app.modules.identity_access.services.classroom_auth import HASHER  # noqa: E402

ALLOWED_ENVIRONMENTS = {"preview", "local-dev"}
PREVIEW_PASSWORD = "preview-password"
TEACHERS = 3
STUDENTS = 30
SEATED_IN_FIRST_ROOM = 10

DOCUMENT = ScriptDocument.model_validate(
    {
        "title": "預覽環境示範：電車難題",
        "questions": [
            {
                "id": "trolley",
                "title": "岔道上的選擇",
                "scenario": (
                    "一輛失控的電車正駛向五名工人。你站在轉轍器旁，"
                    "拉下拉桿，電車會轉向另一條軌道，那裡有一名工人。"
                ),
                "options": [
                    {"id": "pull", "text": "拉下拉桿"},
                    {"id": "stay", "text": "不拉"},
                ],
            },
            {
                "id": "bridge",
                "title": "天橋上的陌生人",
                "scenario": (
                    "同一輛電車駛向五名工人。你站在天橋上，身旁有一位體型壯碩的陌生人，"
                    "推他下去可以擋住電車。"
                ),
                "options": [
                    {"id": "push", "text": "推他下去"},
                    {"id": "stay", "text": "不推"},
                ],
            },
        ],
        # Keep the default room budget: 0 would block every call even after
        # preview-llm is granted. Without a key no call is made anyway, and the
        # preview-wide CLASSROOM_LLM_DAILY_BUDGET still caps usage.
    }
).model_dump()


def account(db, username):
    row = storage.Account(
        username=username,
        email=f"{username}@preview.invalid",
        password_hash=HASHER.hash(PREVIEW_PASSWORD),
        verified=True,
    )
    db.add(row)
    db.flush()
    return row


def seed():
    # No default: an unset marker must not pass for local-dev against a real database.
    environment = os.environ.get("SOCRATES_ENVIRONMENT", "")
    if environment not in ALLOWED_ENVIRONMENTS:
        raise SystemExit(f"seed_preview: refusing to seed SOCRATES_ENVIRONMENT={environment!r}")
    storage.configure()
    with storage.transaction() as db:
        if db.scalar(select(storage.Account).where(storage.Account.username == "teacher001")):
            print("seed_preview: already seeded")
            return
        codes = []
        for n in range(1, TEACHERS + 1):
            teacher = account(db, f"teacher{n:03d}")
            script = storage.Script(owner_id=teacher.id, document=DOCUMENT, revision=1)
            db.add(script)
            db.flush()
            room = service.create_room(db, teacher, script.id)
            code = f"PREVIEW{n}"
            db.get(storage.Room, room["id"]).code = code
            db.flush()
            codes.append(code)
        for n in range(1, STUDENTS + 1):
            student = account(db, f"user{n:03d}")
            if n <= SEATED_IN_FIRST_ROOM:
                service.join(db, student, JoinRoom(code=codes[0], alias=f"同學{n:02d}"))
    print(
        f"seed_preview: teacher001..teacher{TEACHERS:03d}, user001..user{STUDENTS:03d}, "
        f"rooms {', '.join(codes)}; password {PREVIEW_PASSWORD!r}"
    )


if __name__ == "__main__":
    seed()

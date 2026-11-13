#!/usr/bin/env python3
"""Factory accounts for preview, QA (stage), dev and local databases (deploy/preview/README.md).

The backend image runs this after `alembic upgrade head` on every start
(deploy/stage/backend.Dockerfile). It creates the same predictable people every time:

    teacher001..teacher003   each owns a script and a lobby room (code PREVIEW1..3)
    user001..user030         students; user001..user010 already sit in PREVIEW1
    demo course              owned by teacher001, user001..user010 enrolled, one activity
                             open for 30 days from the first run

All passwords are DEMO_PASSWORD and every account is already verified, so no
mail is ever needed. Safe to re-run: accounts are created once, and the demo
course is added once to databases seeded before it existed.

Refuses to run unless SOCRATES_ENVIRONMENT is explicitly one of DEMO_ENVIRONMENTS
(unset fails too). The password is public, so production must never get these
accounts; the login page offers the same accounts only in the same environments.
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

from app.modules.classroom_core.contracts import JoinRoom  # noqa: E402
from app.modules.content_authoring.contracts import ScriptDocument  # noqa: E402
from app.modules.platform import storage as storage  # noqa: E402
from app.modules.app_shell import models as _models  # noqa: E402,F401
from app.modules.classroom_core import runtime as service  # noqa: E402
from app.modules.identity_access.auth import HASHER  # noqa: E402
from app.modules.identity_access.repositories import Account  # noqa: E402
from app.modules.content_authoring.repositories import Script  # noqa: E402
from app.modules.classroom_core.repositories import Room  # noqa: E402
from app.modules.course_management import activities, courses, enrollment  # noqa: E402
from app.modules.course_management.contracts import ActivityDraft, CourseCreate  # noqa: E402
from app.modules.course_management.repositories import Course  # noqa: E402
from app.modules.platform.demo import DEMO_ENVIRONMENTS, DEMO_PASSWORD  # noqa: E402

ALLOWED_ENVIRONMENTS = DEMO_ENVIRONMENTS
TEACHERS = 3
STUDENTS = 30
SEATED_IN_FIRST_ROOM = 10
DEMO_COURSE_NAME = "示範課程：電車難題"
DEMO_ACTIVITY_DAYS = 30

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
    row = Account(
        username=username,
        email=f"{username}@preview.invalid",
        password_hash=HASHER.hash(DEMO_PASSWORD),
        verified=True,
    )
    db.add(row)
    db.flush()
    return row


def _accounts(db):
    codes = []
    for n in range(1, TEACHERS + 1):
        teacher = account(db, f"teacher{n:03d}")
        script = Script(owner_id=teacher.id, document=DOCUMENT, revision=1)
        db.add(script)
        db.flush()
        room = service.create_room(db, teacher, script.id)
        code = f"PREVIEW{n}"
        db.get(Room, room["id"]).code = code
        db.flush()
        codes.append(code)
    for n in range(1, STUDENTS + 1):
        student = account(db, f"user{n:03d}")
        if n <= SEATED_IN_FIRST_ROOM:
            service.join(db, student, JoinRoom(code=codes[0], alias=f"同學{n:02d}"))
    return codes


def _by_name(db, username):
    return db.scalar(select(Account).where(Account.username == username))


def _demo_course(db, now):
    teacher = _by_name(db, "teacher001")
    found = db.scalar(select(Course).where(Course.owner_id == teacher.id, Course.name == DEMO_COURSE_NAME))
    if found is not None:
        return None
    course = courses.create(
        db,
        teacher,
        CourseCreate(name=DEMO_COURSE_NAME, teacher_name="teacher001", intro="測試用的示範課程。"),
    )
    for n in range(1, SEATED_IN_FIRST_ROOM + 1):
        enrollment.enroll(db, _by_name(db, f"user{n:03d}"), course, f"同學{n:02d}")
    draft = ActivityDraft(
        title="岔道上的選擇：主動造成傷害與不作為，在道德上有沒有差別",
        ends_at=now + DEMO_ACTIVITY_DAYS * 86400,
    )
    activities.publish(db, activities.create_draft(db, course, draft), now)
    return course.code


def seed_into(db, now: float):
    """Create whatever is missing; returns what was created, for the log line."""
    created = []
    if _by_name(db, "teacher001") is None:
        codes = _accounts(db)
        created.append(
            f"teacher001..teacher{TEACHERS:03d}, user001..user{STUDENTS:03d}, rooms {', '.join(codes)}"
        )
    code = _demo_course(db, now)
    if code:
        created.append(f"demo course {code}")
    return created


def seed():
    # No default: an unset marker must not pass for local-dev against a real database.
    environment = os.environ.get("SOCRATES_ENVIRONMENT", "")
    if environment not in ALLOWED_ENVIRONMENTS:
        raise SystemExit(f"seed_preview: refusing to seed SOCRATES_ENVIRONMENT={environment!r}")
    storage.configure()
    with storage.transaction() as db:
        created = seed_into(db, activities.now())
    if created:
        print(f"seed_preview: {'; '.join(created)}; password {DEMO_PASSWORD!r}")
    else:
        print("seed_preview: already seeded")


if __name__ == "__main__":
    seed()

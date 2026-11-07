"""scripts/seed_preview.py：測試帳號與示範課程。

腳本不在 app 套件裡：CI 從 repo 根目錄的 scripts/ 讀，docker 開發環境掛在 /app/scripts。
"""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.modules.course_management.repositories import Activity, Course, Enrollment
from app.modules.identity_access.auth import HASHER
from app.modules.identity_access.repositories import Account


def _load_seed():
    here = Path(__file__).resolve()
    for scripts in (here.parents[2] / "scripts", here.parents[1] / "scripts"):
        path = scripts / "seed_preview.py"
        if path.is_file():
            spec = importlib.util.spec_from_file_location("seed_preview", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise FileNotFoundError("scripts/seed_preview.py")


seed_preview = _load_seed()


def _account(db, username):
    return db.scalar(select(Account).where(Account.username == username))


def _demo_courses(db, teacher):
    return db.scalars(
        select(Course).where(
            Course.owner_id == teacher.id, Course.name == seed_preview.DEMO_COURSE_NAME
        )
    ).all()


@pytest.mark.parametrize("environment", ["production", "", "STAGE"])
def test_refuses_outside_seeded_environments(monkeypatch, environment):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", environment)
    with pytest.raises(SystemExit, match="refusing"):
        seed_preview.seed()


def test_refuses_when_environment_unset(monkeypatch):
    monkeypatch.delenv("SOCRATES_ENVIRONMENT", raising=False)
    with pytest.raises(SystemExit, match="refusing"):
        seed_preview.seed()


@pytest.mark.parametrize("environment", ["stage", "dev"])
def test_stage_and_dev_are_allowed(environment):
    assert environment in seed_preview.ALLOWED_ENVIRONMENTS


def test_seeds_accounts_and_an_open_demo_course(db):
    seed_preview.seed_into(db, now=1_800_000_000.0)

    teacher = _account(db, "teacher001")
    assert teacher.verified
    assert HASHER.verify(teacher.password_hash, "preview-password")
    assert _account(db, "teacher003") is not None
    assert _account(db, "user030") is not None

    [course] = _demo_courses(db, teacher)
    enrolled = db.scalars(select(Enrollment).where(Enrollment.course_id == course.id)).all()
    assert len(enrolled) == 10
    usernames = {db.get(Account, e.account_id).username for e in enrolled}
    assert usernames == {f"user{n:03d}" for n in range(1, 11)}

    [activity] = db.scalars(select(Activity).where(Activity.course_id == course.id)).all()
    assert activity.current_revision_id is not None
    assert activity.starts_at == 1_800_000_000.0
    assert activity.ends_at == 1_800_000_000.0 + 30 * 86400


def test_running_twice_adds_nothing(db):
    seed_preview.seed_into(db, now=1_800_000_000.0)
    seed_preview.seed_into(db, now=1_800_000_100.0)
    assert (
        db.scalar(select(func.count()).select_from(Account).where(Account.username == "teacher001"))
        == 1
    )
    assert len(_demo_courses(db, _account(db, "teacher001"))) == 1


def test_already_seeded_accounts_still_get_the_demo_course(db):
    # 示範課程之前就 seed 過的 preview／本機資料庫：帳號已在，只補課程
    db.add(
        Account(
            username="teacher001",
            email="teacher001@preview.invalid",
            password_hash="x",
            verified=True,
        )
    )
    for n in range(1, 31):
        db.add(
            Account(
                username=f"user{n:03d}",
                email=f"user{n:03d}@preview.invalid",
                password_hash="x",
                verified=True,
            )
        )
    db.flush()
    seed_preview.seed_into(db, now=1_800_000_000.0)
    assert _account(db, "teacher001").password_hash == "x"
    assert len(_demo_courses(db, _account(db, "teacher001"))) == 1

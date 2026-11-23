"""學生「我的對話」：主流程題庫，以及每位學生一門、由系統帳號擁有的私人課程。

題庫是一份檔案，服務啟動時載入並驗證，壞掉就讓服務起不來（跟 ladder、programs 同一個原則）。
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.course_management import activities
from app.modules.course_management.codes import new_code
from app.modules.course_management.contracts import ActivityDraft
from app.modules.course_management.repositories import Activity, Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform.env import env_int, env_str
from app.modules.platform.errors import DomainError
from app.modules.identity_access.auth import display_name

BANK_PATH = Path(__file__).with_name("practice_bank.yaml")

Category = Literal["life", "honesty", "self", "tech"]


class BankItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True, strict=True)

    id: str = Field(pattern=r"^[a-z0-9-]{1,40}$")
    title: str = Field(min_length=1, max_length=40)
    body: str = Field(min_length=1, max_length=300)
    category: Category
    recommended: bool


_bank: tuple[BankItem, ...] = ()


def load_bank(path: Path | None = None) -> tuple[BankItem, ...]:
    """Read and validate the bank; any problem raises ValueError naming the file."""
    source = path or BANK_PATH
    raw = yaml.safe_load(source.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"題庫檔要是一個不空的清單：{source}")
    try:
        items = tuple(BankItem.model_validate(entry) for entry in raw)
    except ValidationError as exc:
        raise ValueError(f"題庫檔不合法：{source}\n{exc}") from exc
    ids = [item.id for item in items]
    if len(set(ids)) != len(ids):
        raise ValueError(f"題庫檔有重複的 id：{source}")
    if not any(item.recommended for item in items):
        raise ValueError(f"題庫檔至少要有一題推薦題：{source}")
    return items


def install_bank(path: Path | None = None) -> None:
    """Called once at startup; keeps the validated bank for the request handlers."""
    global _bank
    _bank = load_bank(path)


def bank() -> tuple[BankItem, ...]:
    return _bank


def bank_item(item_id: str) -> BankItem | None:
    return next((item for item in _bank if item.id == item_id), None)


# 系統帳號：擁有所有私人課程。`@` 不符合註冊的使用者名稱規則，沒人註冊得到；沒有 email 和密碼，
# 所以也不能登入（auth.login 對沒有密碼的帳號一律拒絕）。
PRACTICE_OWNER = "@practice-owner"


def _find_owner(db: Session) -> Account | None:
    return db.scalar(select(Account).where(Account.username == PRACTICE_OWNER))


def practice_owner(db: Session) -> Account:
    """The system account, created on first use. Several workers may start at once: a lost race
    on the unique username reads the winner's row instead of failing."""
    found = _find_owner(db)
    if found is not None:
        return found
    try:
        with db.begin_nested():
            row = Account(username=PRACTICE_OWNER, account_role="teacher", verified=True)
            db.add(row)
        return row
    except IntegrityError:
        winner = _find_owner(db)
        if winner is None:
            raise
        return winner


def lock_practice_owner(db: Session) -> Account:
    """The system account, row-locked until the transaction ends: whoever writes the 系統 AI
    connection (startup env import, 後台 save) holds it, so the check and the write are one
    step (後台 spec P30). FOR NO KEY UPDATE, so rows that only point at this account
    (a student's new 我的對話 course) are not held up."""
    owner = practice_owner(db)
    db.flush()
    locked = db.scalar(
        select(Account)
        .where(Account.id == owner.id)
        .with_for_update(key_share=True)  # PostgreSQL: FOR NO KEY UPDATE
        .execution_options(populate_existing=True)
    )
    assert locked is not None
    return locked


# ---- 私人課程 ----------------------------------------------------------------------------------

PRACTICE_COURSE_NAME = "我的對話"
PRACTICE_TEACHER_NAME = "蘇格拉底"
# 練習沒有期限：2100-01-01。學生端的私人活動畫面不顯示時間（M10、M16）。
PRACTICE_ENDS_AT = 4102444800.0
FALLBACK_TITLE_LENGTH = 20


def practice_course(db: Session, account_id: str) -> Course | None:
    return db.scalar(select(Course).where(Course.practice_account_id == account_id))


def ensure_practice_course(db: Session, student: Account, owner: Account) -> Course:
    """The student's private course, created on first use and enrolled at once.

    Each try inserts in a savepoint. Any unique conflict first looks for this student's course
    (another request won the race); only if there is none is it a code collision, retried with a
    new code like ordinary courses."""
    found = practice_course(db, student.id)
    if found is not None:
        return found
    for _ in range(5):
        try:
            with db.begin_nested():
                course = Course(
                    owner_id=owner.id,
                    practice_account_id=student.id,
                    name=PRACTICE_COURSE_NAME,
                    teacher_name=PRACTICE_TEACHER_NAME,
                    code=new_code(),
                    code_enabled=False,
                )
                db.add(course)
                db.flush()
                db.add(
                    Enrollment(
                        course_id=course.id,
                        account_id=student.id,
                        display_name=display_name(student)[:40],
                    )
                )
                db.flush()
            return course
        except IntegrityError:
            winner = practice_course(db, student.id)
            if winner is not None:
                return winner
    raise DomainError("COURSE_CODE_EXHAUSTED", 503)


def daily_limit() -> int:
    return env_int("SOCRATES_PRACTICE_DAILY_LIMIT", 5)


def _zone() -> ZoneInfo:
    return ZoneInfo(env_str("SOCRATES_PRACTICE_TIMEZONE", "Asia/Taipei"))


def check_settings() -> None:
    """Fail at start-up, not on a student's first request, when the limit or time zone is wrong."""
    try:
        limit = daily_limit()
    except ValueError as exc:
        raise ValueError(f"SOCRATES_PRACTICE_DAILY_LIMIT must be a whole number: {exc}") from exc
    if limit < 1:
        raise ValueError(
            "SOCRATES_PRACTICE_DAILY_LIMIT must be at least 1 (leave the API key empty to turn practice off)"
        )
    try:
        _zone()
    except (ValueError, KeyError) as exc:  # ZoneInfoNotFoundError is a KeyError
        raise ValueError(f"SOCRATES_PRACTICE_TIMEZONE is not a known time zone: {exc}") from exc


def _day_start(at: float) -> float:
    zone = _zone()
    local = datetime.fromtimestamp(at, zone)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


def created_today(db: Session, course: Course | None, at: float) -> int:
    if course is None:
        return 0
    return int(
        db.scalar(
            select(func.count())
            .select_from(Activity)
            .where(Activity.course_id == course.id, Activity.created_at >= _day_start(at))
        )
        or 0
    )


def create_practice_activity(db: Session, course: Course, item: BankItem, at: float) -> Activity:
    """One dialogue = one activity, published at once. The course row is locked first so two
    requests cannot both pass the daily limit."""
    db.scalar(select(Course).where(Course.id == course.id).with_for_update())
    if created_today(db, course, at) >= daily_limit():
        raise DomainError("PRACTICE_DAILY_LIMIT", 429)
    draft = ActivityDraft(
        title=item.title, scenario=item.body, starts_at=at, ends_at=PRACTICE_ENDS_AT
    )
    activity = activities.create_draft(db, course, draft)
    activity.bank_item_id = item.id
    activity.created_at = at
    activities.publish(db, activity, at)
    return activity


def practice_activities(db: Session, course: Course | None) -> list[Activity]:
    if course is None:
        return []
    return list(
        db.scalars(
            select(Activity).where(Activity.course_id == course.id, Activity.deleted.is_(False))
        )
    )


def display_title(item: BankItem | None, stored_text: str) -> str:
    """The topic's short title; for a topic since removed from the bank, the first 20 characters
    of what the activity stored."""
    if item is not None:
        return item.title
    if len(stored_text) <= FALLBACK_TITLE_LENGTH:
        return stored_text
    return stored_text[:FALLBACK_TITLE_LENGTH] + "…"

"""意見回饋：送出、名單上的人讀取、清掉 90 天前的截圖。

誰都能送（spec P1）：有效的 session 照常驗 CSRF；只有 session 失效或訪客過期才當成未登入
（P14）。讀取只開給平台管理員（後台 spec P11），其他人一律當成不存在。
"""

import base64
import binascii
from dataclasses import dataclass
from typing import cast

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.modules.feedback.contracts import (
    AccountKind,
    FeedbackCreate,
    FeedbackIdentity,
    FeedbackKind,
    FeedbackItem,
    FeedbackPage,
)
from app.modules.feedback.repositories import Feedback
from app.modules.identity_access.repositories import Account
from app.modules.identity_access.service import identity, is_admin
from app.modules.platform.errors import DomainError
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.release import release_snapshot

MAX_MESSAGE = 2000
MAX_CONTACT = 200
MAX_PAGE = 500
MAX_USER_AGENT = 400
# 750 KiB 的圖編成 base64 正好 1,024,000 字；前端目標 700 KB（P5、P19）
MAX_SCREENSHOT_BYTES = 750 * 1024
MAX_SCREENSHOT_BASE64 = 1_024_000
ACCOUNT_LIMIT, ANONYMOUS_LIMIT, WINDOW_SECONDS = 10, 60, 600  # P7
PAGE_SIZE = 50
SCREENSHOT_DAYS = 90  # P10
SIGNED_OUT = ("LOGIN_REQUIRED", "GUEST_EXPIRED")

MAGIC = {
    "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "image/webp": lambda data: data[:4] == b"RIFF" and data[8:12] == b"WEBP",
}


@dataclass(frozen=True)
class Sender:
    identity: FeedbackIdentity
    account_id: str | None


def sender(db: Session, token: str | None, csrf: str | None) -> Sender:
    """Who is sending. A dead session or an expired guest counts as signed out; a live session
    with the wrong CSRF token does not (P14)."""
    if not token:
        return Sender("anonymous", None)
    try:
        account, _ = identity(db, token, csrf, mutation=True, verified=False, allow_guest=True)
    except DomainError as error:
        if error.code in SIGNED_OUT:
            return Sender("anonymous", None)
        raise
    if account.kind != "registered":
        return Sender("guest", account.id)
    return Sender("teacher" if account.account_role == "teacher" else "student", account.id)


def _too_long(value: str | None, limit: int) -> bool:
    return value is not None and len(value) > limit


def _screenshot(body: FeedbackCreate) -> tuple[bytes, str] | None:
    upload = body.screenshot
    if upload is None:
        return None
    if upload.mime not in MAGIC or len(upload.data_base64) > MAX_SCREENSHOT_BASE64:
        raise DomainError("FEEDBACK_SCREENSHOT_INVALID", 422)
    try:
        data = base64.b64decode(upload.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise DomainError("FEEDBACK_SCREENSHOT_INVALID", 422) from None
    if not data or len(data) > MAX_SCREENSHOT_BYTES or not MAGIC[upload.mime](data):
        raise DomainError("FEEDBACK_SCREENSHOT_INVALID", 422)
    return data, upload.mime


def submit(
    db: Session,
    who: Sender,
    body: FeedbackCreate,
    *,
    user_agent: str,
    client_host: str,
) -> str:
    message = body.message.strip()
    if not message:
        raise DomainError("FEEDBACK_MESSAGE_REQUIRED", 422)
    contact = (body.contact or "").strip() or None
    if (
        _too_long(message, MAX_MESSAGE)
        or _too_long(contact, MAX_CONTACT)
        or _too_long(body.page, MAX_PAGE)
    ):
        raise DomainError("FEEDBACK_TOO_LONG", 422)
    shot = _screenshot(body)
    if who.account_id is not None:
        key, maximum = f"feedback:{who.account_id}", ACCOUNT_LIMIT
    else:
        key, maximum = f"feedback-ip:{client_host}", ANONYMOUS_LIMIT
    enforce_rate_limit(db, key, maximum, WINDOW_SECONDS, error_code="RATE_LIMITED")
    release_id, source_sha = release_snapshot()
    row = Feedback(
        kind=body.kind,
        message=message,
        # 正式帳號找得到人，聯絡方式只收未登入與訪客的（P3）
        contact=contact if who.identity in ("anonymous", "guest") else None,
        page=body.page.split("?", 1)[0].split("#", 1)[0],
        viewport_w=body.viewport.w,
        viewport_h=body.viewport.h,
        locale=body.locale,
        user_agent=user_agent[:MAX_USER_AGENT],
        release_id=release_id[:80],
        source_sha=source_sha[:64],
        account_id=who.account_id,
        identity=who.identity,
        screenshot=shot[0] if shot else None,
        screenshot_mime=shot[1] if shot else None,
        screenshot_size=len(shot[0]) if shot else None,
    )
    db.add(row)
    db.flush()
    return row.id


def require_reader(account: Account) -> None:
    """Only platform admins read feedback (後台 spec P11); everyone else sees nothing."""
    if not is_admin(account):
        raise DomainError("FEEDBACK_NOT_FOUND", 404)


def list_page(db: Session, page: int) -> FeedbackPage:
    rows = db.scalars(
        select(Feedback)
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE + 1)
    ).all()
    shown = rows[:PAGE_SIZE]
    ids = {row.account_id for row in shown if row.account_id}
    accounts = (
        {a.id: a for a in db.scalars(select(Account).where(Account.id.in_(ids)))} if ids else {}
    )
    items = []
    for row in shown:
        owner = accounts.get(row.account_id) if row.account_id else None
        kind = owner.kind if owner else None
        items.append(
            FeedbackItem(
                id=row.id,
                created_at=row.created_at,
                kind=cast(FeedbackKind | None, row.kind),
                message=row.message,
                contact=row.contact,
                page=row.page,
                viewport_w=row.viewport_w,
                viewport_h=row.viewport_h,
                locale=row.locale,
                user_agent=row.user_agent,
                release_id=row.release_id,
                identity=cast(FeedbackIdentity, row.identity),
                account_kind=cast(AccountKind | None, kind),
                account_name=owner.username if owner and kind != "expired_guest" else None,
                has_screenshot=row.screenshot is not None,
            )
        )
    return FeedbackPage(items=items, page=page, has_more=len(rows) > PAGE_SIZE)


def screenshot(db: Session, feedback_id: str) -> tuple[bytes, str]:
    row = db.get(Feedback, feedback_id)
    if row is None or row.screenshot is None or row.screenshot_mime is None:
        raise DomainError("FEEDBACK_NOT_FOUND", 404)
    return row.screenshot, row.screenshot_mime


def purge_screenshots(db: Session, now: float) -> int:
    """Clears screenshots older than 90 days; the text stays (P10)."""
    result = db.execute(
        update(Feedback)
        .where(
            Feedback.created_at < now - SCREENSHOT_DAYS * 86400,
            Feedback.screenshot.is_not(None),
        )
        .values(screenshot=None, screenshot_mime=None, screenshot_size=None)
    )
    return int(result.rowcount or 0)

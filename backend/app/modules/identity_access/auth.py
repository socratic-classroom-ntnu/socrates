"""Opaque sessions, restricted verification, one-use tokens, and durable mail receipts."""

from __future__ import annotations

from typing import Any, Callable
import html
import os
import secrets
import time
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import delete, func, select

from app.modules.identity_access.email_delivery import (
    delivery_status,
    mask_recipient,
    queue_delivery,
)
from app.modules.platform.errors import DomainError
from app.modules.identity_access.repositories import Account, EmailToken, LoginSession, Mail
from app.modules.platform.storage import digest, transaction

HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
COOKIE = "socrates_session"
# Email 驗證連結與重設密碼連結的有效期間（秒）。
VERIFY_TOKEN_SECONDS = 86400
RESET_TOKEN_SECONDS = 1800
# 釋出的帳號不能再用密碼登入（不是合法的 argon2 雜湊，verify 會失敗）。
RELEASED_PASSWORD_HASH = "RELEASED_UNVERIFIED_ACCOUNT"
SESSION_SECONDS = 43200
# 訪客閒置這麼久就到期；每次有動作都從現在重新算。
GUEST_SECONDS = 7 * 86400


# Modules that keep per-account progress (classroom points and achievements) add fields to the
# account view through this registry; the app shell wires them. Each extension returns a dict.
ACCOUNT_VIEW_EXTENSIONS: list[Callable[[Any, Any], dict]] = []


def extend_account_view(extension: Callable[[Any, Any], dict]) -> None:
    if extension not in ACCOUNT_VIEW_EXTENSIONS:
        ACCOUNT_VIEW_EXTENSIONS.append(extension)


def account_view(db, account, csrf=""):
    view = {
        "id": account.id,
        "username": account.username,
        "email": account.email or "",
        "email_masked": mask_recipient(account.email) if account.email else "",
        "verified": account.verified,
        "authority_state": ("FULL_PRODUCT" if account.verified else "EMAIL_VERIFICATION"),
        "csrf_token": csrf,
        "points": 0,
        "achievements": [],
        "locale": account.locale,
        "kind": account.kind,
        "guest_expires_at": account.guest_expires_at,
    }
    for extension in ACCOUNT_VIEW_EXTENSIONS:
        view.update(extension(db, account))
    return view


def set_locale(account, locale: str) -> None:
    account.locale = locale


def _new_session(db, account):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    db.add(
        LoginSession(
            token_hash=digest(token),
            account_id=account.id,
            csrf_token=csrf,
            expires_at=time.time()
            + (GUEST_SECONDS if account.kind == "guest" else SESSION_SECONDS),
        )
    )
    return token, account_view(db, account, csrf)


def _mail_copy(purpose: str, link: str) -> tuple[str, str, str]:
    escaped = html.escape(link, quote=True)
    if purpose == "verify":
        subject = "Socratic Classroom Email 驗證"
        text = "請開啟以下連結完成 Email 驗證：\n" + link + "\n\n連結具備一次性與有效期間。"
        html_body = (
            '<main style="font-family:system-ui,sans-serif;line-height:1.6">'
            "<h1>Socratic Classroom Email 驗證</h1>"
            "<p>開啟按鈕後，帳號會取得完整課堂權限。</p>"
            f'<p><a href="{escaped}" style="display:inline-block;padding:12px 18px;'
            'background:#8b6f47;color:white;text-decoration:none;border-radius:8px">'
            "完成 Email 驗證</a></p>"
            "<p>連結具備一次性與有效期間。</p>"
            "</main>"
        )
    else:
        subject = "Socratic Classroom 重設密碼"
        text = "請開啟以下連結設定新密碼：\n" + link + "\n\n連結具備一次性與有效期間。"
        html_body = (
            '<main style="font-family:system-ui,sans-serif;line-height:1.6">'
            "<h1>Socratic Classroom 重設密碼</h1>"
            f'<p><a href="{escaped}" style="display:inline-block;padding:12px 18px;'
            'background:#8b6f47;color:white;text-decoration:none;border-radius:8px">'
            "設定新密碼</a></p>"
            "<p>連結具備一次性與有效期間。</p>"
            "</main>"
        )
    return subject, text, html_body


def queue_token(db, account, purpose):
    current = time.time()
    seconds = RESET_TOKEN_SECONDS if purpose == "reset" else VERIFY_TOKEN_SECONDS

    # One current token per account/purpose keeps the recovery path deterministic.
    rows = db.scalars(
        select(EmailToken)
        .where(
            EmailToken.account_id == account.id,
            EmailToken.purpose == purpose,
            EmailToken.consumed.is_(False),
        )
        .with_for_update()
    ).all()
    for row in rows:
        row.consumed = True

    token = secrets.token_urlsafe(32)
    token_hash = digest(token)
    expires_at = current + seconds
    db.add(
        EmailToken(
            token_hash=token_hash,
            account_id=account.id,
            purpose=purpose,
            expires_at=expires_at,
        )
    )

    field = "reset_token" if purpose == "reset" else "verify_token"
    link = (
        os.environ.get(
            "SOCRATES_PUBLIC_ORIGIN",
            "http://127.0.0.1:18980",
        ).rstrip("/")
        + "/?"
        + field
        + "="
        + token
    )
    subject, text, html_body = _mail_copy(purpose, link)
    mail = Mail(
        id=str(uuid4()),
        recipient=account.email,
        subject=subject,
        body=text,
        state="PENDING",
        next_at=current,
        attempts=0,
    )
    db.add(mail)
    db.flush()
    delivery = queue_delivery(
        db,
        mail,
        account_id=account.id,
        purpose=purpose,
        html_body=html_body,
        preview_url=link,
    )
    return {
        "mail_id": mail.id,
        "delivery_state": delivery.provider_status,
        "expires_at": expires_at,
    }


def _verification_open(db, account, now):
    """未驗證帳號的驗證連結是否仍在有效期間（以最後一次寄出的驗證連結為準；沒有連結時以註冊時間計）。"""
    latest = db.scalar(
        select(func.max(EmailToken.expires_at)).where(
            EmailToken.account_id == account.id,
            EmailToken.purpose == "verify",
        )
    )
    if latest is None:
        return (account.created_at or 0) + VERIFY_TOKEN_SECONDS > now
    return latest > now


def _release(db, account, now):
    """釋出過期未驗證帳號的使用者名稱與 Email：改成唯一的墓碑值、停用登入與連結。

    不刪除帳號列：其他資料表以外鍵指向 accounts.id。"""
    account.username = f"released-{account.id}"
    account.email = f"{account.id}@released.invalid"
    account.password_hash = RELEASED_PASSWORD_HASH
    for session in db.scalars(
        select(LoginSession).where(LoginSession.account_id == account.id).with_for_update()
    ):
        session.expires_at = min(session.expires_at, now)
    for token in db.scalars(
        select(EmailToken)
        .where(EmailToken.account_id == account.id, EmailToken.consumed.is_(False))
        .with_for_update()
    ):
        token.consumed = True
        token.expires_at = min(token.expires_at, now)


def _claim_identity(db, username, email, now, upgrading=None):
    """新註冊要用的使用者名稱／Email：已驗證帳號佔用就拒絕；驗證連結仍有效的未驗證帳號佔用也拒絕；
    驗證連結已過期的未驗證帳號在同一個交易內釋出。訪客升級時（upgrading）不算它自己。"""
    holders = db.scalars(
        select(Account)
        .where((Account.username == username) | (Account.email == email))
        .where(Account.id != (upgrading.id if upgrading else ""))
        .with_for_update()
    ).all()
    for field, code in (("username", "USERNAME_TAKEN"), ("email", "EMAIL_TAKEN")):
        value = username if field == "username" else email
        if any(a.verified and getattr(a, field) == value for a in holders):
            raise DomainError(code, 409)
    if any(_verification_open(db, a, now) for a in holders):
        raise DomainError("ACCOUNT_PENDING_VERIFICATION", 409)
    for stale in holders:
        _release(db, stale, now)
    if holders:
        db.flush()


def register(body):
    from sqlalchemy.exc import IntegrityError

    username = body.username.casefold()
    email = body.email.strip().casefold()
    try:
        with transaction() as db:
            _claim_identity(db, username, email, time.time())
            account = Account(
                username=username,
                email=email,
                password_hash=HASHER.hash(body.password),
            )
            db.add(account)
            db.flush()
            queued = queue_token(db, account, "verify")
            token, result = _new_session(db, account)
            result["verification_delivery"] = queued
            return token, result
    except IntegrityError as exc:
        # Lost a race on the unique columns after _claim_identity passed.
        raise DomainError("ACCOUNT_DATA_TAKEN", 409) from exc


def login(body):
    with transaction() as db:
        account = db.scalar(
            select(Account).where(
                (Account.username == body.login.casefold())
                | (Account.email == body.login.casefold())
            )
        )
        # Equal-work password verification also applies to unknown accounts and to guests.
        if account is None or account.password_hash is None:
            HASHER.hash(body.password)
            raise DomainError("AUTH_INVALID_CREDENTIALS", 401)
        try:
            HASHER.verify(account.password_hash, body.password)
        except (VerifyMismatchError, InvalidHashError) as exc:
            raise DomainError("AUTH_INVALID_CREDENTIALS", 401) from exc
        return _new_session(db, account)


def identity(db, token, csrf=None, mutation=False, verified=True, allow_guest=False):
    """The session's account. Guests get in only where the endpoint opts in (allow_guest), and
    every such request pushes their expiry 7 days ahead."""
    now = time.time()
    session = db.get(LoginSession, digest(token or ""))
    if session is None:
        raise DomainError("LOGIN_REQUIRED", 401)
    account = db.get(Account, session.account_id)
    # A guest's session ends together with the guest, so idle expiry is checked first: the
    # student then sees GUEST_EXPIRED (scan the QR code again), not a login prompt.
    if account.kind == "guest" and (account.guest_expires_at or 0) <= now:
        raise DomainError("GUEST_EXPIRED", 401)
    if session.expires_at <= now:
        raise DomainError("LOGIN_REQUIRED", 401)
    if mutation and not secrets.compare_digest(
        session.csrf_token,
        csrf or "",
    ):
        raise DomainError("SESSION_CSRF_REQUIRED", 403)
    if account.kind == "guest":
        if not allow_guest:
            raise DomainError("GUEST_NOT_ALLOWED", 403)
        account.guest_expires_at = now + GUEST_SECONDS
        session.expires_at = now + GUEST_SECONDS
        return account, session
    if verified and not account.verified:
        raise DomainError("EMAIL_VERIFICATION_REQUIRED", 403)
    return account, session


def use_token(token, purpose, password=None):
    with transaction() as db:
        row = db.scalar(
            select(EmailToken)
            .where(
                EmailToken.token_hash == digest(token),
            )
            .with_for_update()
        )
        if row is None or row.purpose != purpose or row.consumed or row.expires_at <= time.time():
            raise DomainError("AUTH_TOKEN_INVALID", 400)
        account = db.get(Account, row.account_id)
        if purpose == "verify":
            account.verified = True
            for other in db.scalars(
                select(EmailToken)
                .where(
                    EmailToken.account_id == account.id,
                    EmailToken.purpose == "verify",
                    EmailToken.consumed.is_(False),
                )
                .with_for_update()
            ):
                other.consumed = True
        else:
            account.password_hash = HASHER.hash(password)
            db.execute(delete(LoginSession).where(LoginSession.account_id == account.id))
            row.consumed = True
    return {"status": ("VERIFIED" if purpose == "verify" else "PASSWORD_RESET")}


def request_email(email, purpose, *, expected_account_id=None):
    with transaction() as db:
        account = db.scalar(select(Account).where(Account.email == email.strip().casefold()))
        if account and (expected_account_id is None or account.id == expected_account_id):
            if purpose == "verify" and account.verified:
                return {
                    "status": "ALREADY_VERIFIED",
                    "message": "帳號已完成 Email 驗證。",
                }
            queued = queue_token(db, account, purpose)
            return {
                "status": "REQUEST_RECORDED",
                "message": "符合條件的帳號將收到郵件。",
                "delivery": queued,
            }
    return {
        "status": "REQUEST_RECORDED",
        "message": "符合條件的帳號將收到郵件。",
    }


def verification_status(account_id: str) -> dict:
    with transaction() as db:
        account = db.get(Account, account_id)
        if account is None:
            raise DomainError("LOGIN_REQUIRED", 401)
        return {
            "verified": account.verified,
            "email_masked": mask_recipient(account.email),
            "authority_state": ("FULL_PRODUCT" if account.verified else "EMAIL_VERIFICATION"),
            "delivery": delivery_status(
                db,
                account_id=account.id,
                purpose="verify",
            ),
        }


def join_as_guest(body):
    """A guest account and its session; the username is the nickname plus a random suffix,
    since two students in one class may pick the same nickname."""
    with transaction() as db:
        account = Account(
            username=f"{body.nickname}-{secrets.token_hex(4)}",
            kind="guest",
            locale=body.locale,
            guest_expires_at=time.time() + GUEST_SECONDS,
        )
        db.add(account)
        db.flush()
        return _new_session(db, account)


def upgrade_guest(db, account, session, body):
    """Registration for a guest: the same account id gains an email and password, so every
    record it already has stays. Like any new registration, it starts unverified."""
    now = time.time()
    _claim_identity(db, account.username, body.email, now, upgrading=account)
    account.email = body.email
    account.password_hash = HASHER.hash(body.password)
    account.kind = "registered"
    account.guest_expires_at = None
    session.expires_at = min(session.expires_at, now + SESSION_SECONDS)
    db.flush()
    result = account_view(db, account, session.csrf_token)
    result["verification_delivery"] = queue_token(db, account, "verify")
    return result

"""Opaque sessions, restricted verification, one-use tokens, and durable mail receipts."""

from __future__ import annotations

import html
import os
import secrets
import time
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import delete, func, select

from .email_delivery import delivery_status, mask_recipient, queue_delivery
from .orchestrator import DomainError
from .storage import (
    Account,
    EmailToken,
    LoginSession,
    Mail,
    PointEntry,
    Room,
    digest,
    transaction,
)

HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
COOKIE = "socrates_session"


def account_view(db, account, csrf=""):
    points = (
        db.scalar(
            select(func.coalesce(func.sum(PointEntry.amount), 0)).where(
                PointEntry.account_id == account.id
            )
        )
        or 0
    )
    achievements = set()
    for room in db.scalars(select(Room)).all():
        for member in room.state.get("members", {}).values():
            if member.get("account_id") == account.id:
                achievements.update(member.get("achievements", []))
    return {
        "id": account.id,
        "username": account.username,
        "email": account.email,
        "email_masked": mask_recipient(account.email),
        "verified": account.verified,
        "authority_state": ("FULL_PRODUCT" if account.verified else "EMAIL_VERIFICATION"),
        "csrf_token": csrf,
        "points": points,
        "achievements": sorted(achievements),
    }


def _new_session(db, account):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    db.add(
        LoginSession(
            token_hash=digest(token),
            account_id=account.id,
            csrf_token=csrf,
            expires_at=time.time() + 43200,
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
    seconds = 1800 if purpose == "reset" else 86400

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


def register(body):
    from sqlalchemy.exc import IntegrityError

    try:
        with transaction() as db:
            account = Account(
                username=body.username.casefold(),
                email=body.email.strip().casefold(),
                password_hash=HASHER.hash(body.password),
            )
            db.add(account)
            db.flush()
            queued = queue_token(db, account, "verify")
            token, result = _new_session(db, account)
            result["verification_delivery"] = queued
            return token, result
    except IntegrityError as exc:
        raise DomainError(
            "帳號資料已使用，請前往登入或重設密碼。",
            409,
        ) from exc


def login(body):
    with transaction() as db:
        account = db.scalar(
            select(Account).where(
                (Account.username == body.login.casefold())
                | (Account.email == body.login.casefold())
            )
        )
        # Equal-work password verification also applies to unknown accounts.
        if account is None:
            HASHER.hash(body.password)
            raise DomainError("請確認登入資料。", 401)
        try:
            HASHER.verify(account.password_hash, body.password)
        except (VerifyMismatchError, InvalidHashError) as exc:
            raise DomainError("請確認登入資料。", 401) from exc
        return _new_session(db, account)


def identity(db, token, csrf=None, mutation=False, verified=True):
    session = db.get(LoginSession, digest(token or ""))
    if session is None or session.expires_at <= time.time():
        raise DomainError("LOGIN_REQUIRED", 401)
    if mutation and not secrets.compare_digest(
        session.csrf_token,
        csrf or "",
    ):
        raise DomainError("SESSION_CSRF_REQUIRED", 403)
    account = db.get(Account, session.account_id)
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
            raise DomainError(
                "請重新申請有效驗證連結。",
                400,
            )
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

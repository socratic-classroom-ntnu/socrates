"""Opaque server sessions, verified email, one-use reset tokens and SMTP outbox."""

import os
import secrets
import time
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from sqlalchemy import delete, func, select
from .storage import Account, LoginSession, EmailToken, Mail, PointEntry, Room, digest, transaction
from .orchestrator import DomainError

HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
COOKIE = "socrates_session"


def account_view(db, a, csrf=""):
    points = (
        db.scalar(
            select(func.coalesce(func.sum(PointEntry.amount), 0)).where(
                PointEntry.account_id == a.id
            )
        )
        or 0
    )
    achievements = set()
    for room in db.scalars(select(Room)).all():
        for m in room.state.get("members", {}).values():
            if m.get("account_id") == a.id:
                achievements.update(m.get("achievements", []))
    return {
        "id": a.id,
        "username": a.username,
        "email": a.email,
        "verified": a.verified,
        "csrf_token": csrf,
        "points": points,
        "achievements": sorted(achievements),
    }


def queue_token(db, a, purpose):
    token = secrets.token_urlsafe(32)
    seconds = 1800 if purpose == "reset" else 86400
    db.add(
        EmailToken(
            token_hash=digest(token),
            account_id=a.id,
            purpose=purpose,
            expires_at=time.time() + seconds,
        )
    )
    field = "reset_token" if purpose == "reset" else "verify_token"
    link = (
        os.environ.get("SOCRATES_PUBLIC_ORIGIN", "http://127.0.0.1:8080").rstrip("/")
        + "/?"
        + field
        + "="
        + token
    )
    db.add(
        Mail(
            recipient=a.email,
            subject="Socrates 帳號驗證" if purpose == "verify" else "Socrates 重設密碼",
            body="請於有效期間內開啟：\n" + link + "\n此連結由本次帳號操作產生。",
        )
    )


def register(body):
    from sqlalchemy.exc import IntegrityError

    try:
        with transaction() as db:
            a = Account(
                username=body.username.casefold(),
                email=body.email,
                password_hash=HASHER.hash(body.password),
            )
            db.add(a)
            db.flush()
            queue_token(db, a, "verify")
    except IntegrityError as exc:
        raise DomainError("帳號資料已使用，請前往登入或重設密碼。", 409) from exc
    return {"status": "VERIFICATION_EMAIL_QUEUED"}


def login(body):
    with transaction() as db:
        a = db.scalar(
            select(Account).where(
                (Account.username == body.login.casefold())
                | (Account.email == body.login.casefold())
            )
        )
        # Equal-work password verification also applies to unknown accounts.
        if a is None:
            HASHER.hash(body.password)
            raise DomainError("請確認登入資料。", 401)
        try:
            HASHER.verify(a.password_hash, body.password)
        except (VerifyMismatchError, InvalidHashError) as exc:
            raise DomainError("請確認登入資料。", 401) from exc
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(24)
        db.add(
            LoginSession(
                token_hash=digest(token),
                account_id=a.id,
                csrf_token=csrf,
                expires_at=time.time() + 43200,
            )
        )
        return token, account_view(db, a, csrf)


def identity(db, token, csrf=None, mutation=False, verified=True):
    session = db.get(LoginSession, digest(token or ""))
    if session is None or session.expires_at <= time.time():
        raise DomainError("LOGIN_REQUIRED", 401)
    if mutation and not secrets.compare_digest(session.csrf_token, csrf or ""):
        raise DomainError("SESSION_CSRF_REQUIRED", 403)
    account = db.get(Account, session.account_id)
    if verified and not account.verified:
        raise DomainError("EMAIL_VERIFICATION_REQUIRED", 403)
    return account, session


def use_token(token, purpose, password=None):
    with transaction() as db:
        row = db.scalar(
            select(EmailToken).where(EmailToken.token_hash == digest(token)).with_for_update()
        )
        if row is None or row.purpose != purpose or row.consumed or row.expires_at <= time.time():
            raise DomainError("請重新申請有效驗證連結。", 400)
        a = db.get(Account, row.account_id)
        if purpose == "verify":
            a.verified = True
        else:
            a.password_hash = HASHER.hash(password)
            db.execute(delete(LoginSession).where(LoginSession.account_id == a.id))
        row.consumed = True
    return {"status": "VERIFIED" if purpose == "verify" else "PASSWORD_RESET"}


def request_email(email, purpose):
    with transaction() as db:
        a = db.scalar(select(Account).where(Account.email == email.strip().casefold()))
        if a:
            queue_token(db, a, purpose)
    return {"status": "REQUEST_RECORDED", "message": "符合條件的帳號將收到郵件。"}

"""Account endpoints: register, login, session, email verification and password reset."""

from fastapi import APIRouter

from fastapi import Request, Response
from app.modules.identity_access import auth as auth
from app.modules.identity_access.service import (
    account,
    auth_limit,
    set_session_cookie as _set_session_cookie,
)
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.identity_access.contracts import (
    AccountView,
    GuestJoin,
    GuestUpgrade,
    LocaleUpdate,
    Login,
    MailRequest,
    Register,
    ResetRequest,
    TokenRequest,
    VerificationStatusView,
)
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction

router = APIRouter()


@router.post("/auth/register", response_model=AccountView)
def register(body: Register, request: Request, response: Response):
    auth_limit(request, "register")
    token, result = auth.register(body)
    _set_session_cookie(response, token)
    return result


@router.post("/auth/login", response_model=AccountView)
def login(body: Login, request: Request, response: Response):
    auth_limit(request, "login")
    token, result = auth.login(body)
    _set_session_cookie(response, token)
    return result


@router.post("/auth/guest", response_model=AccountView)
def join_as_guest(body: GuestJoin, request: Request, response: Response):
    auth_limit(request, "guest")
    token, result = auth.join_as_guest(body)
    _set_session_cookie(response, token, guest=True)
    return result


@router.post("/auth/guest/upgrade", response_model=AccountView)
def upgrade_guest(body: GuestUpgrade, request: Request):
    auth_limit(request, "register")
    with transaction() as db:
        a, s = account(db, request, mutation=True, verified=False, allow_guest=True)
        if a.kind != "guest":
            raise DomainError("GUEST_ONLY", 409)
        return auth.upgrade_guest(db, a, s, body)


@router.get("/auth/me", response_model=AccountView)
def me(request: Request):
    with transaction() as db:
        a, s = account(db, request, verified=False, allow_guest=True)
        return auth.account_view(db, a, s.csrf_token)


@router.put("/account/locale", response_model=AccountView)
def update_locale(body: LocaleUpdate, request: Request):
    with transaction() as db:
        a, s = account(db, request, mutation=True, verified=False, allow_guest=True)
        auth.set_locale(a, body.locale)
        return auth.account_view(db, a, s.csrf_token)


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    with transaction() as db:
        _, s = account(db, request, True, False, allow_guest=True)
        db.delete(s)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"status": "SIGNED_OUT"}


@router.post("/auth/verify")
def verify(body: TokenRequest, request: Request):
    auth_limit(request, "verify")
    return auth.use_token(body.token, "verify")


@router.post("/auth/verification-email")
def verification_email(body: MailRequest, request: Request):
    auth_limit(request, "mail")
    with transaction() as db:
        current, _ = account(db, request, True, False)
        enforce_rate_limit(
            db,
            "verification-resend:" + current.id,
            3,
            900,
        )
        account_id = current.id
        email = current.email
    return auth.request_email(
        email,
        "verify",
        expected_account_id=account_id,
    )


@router.get(
    "/auth/verification-status",
    response_model=VerificationStatusView,
    response_model_exclude_unset=True,
)
def verification_status(request: Request):
    with transaction() as db:
        current, _ = account(db, request, verified=False)
        account_id = current.id
    return auth.verification_status(account_id)


@router.post("/auth/forgot-password")
def forgot(body: MailRequest, request: Request):
    auth_limit(request, "mail")
    return auth.request_email(body.email, "reset")


@router.post("/auth/reset-password")
def reset(body: ResetRequest, request: Request):
    auth_limit(request, "reset")
    return auth.use_token(body.token, "reset", body.password)


@router.post("/webhooks/resend")
async def resend_webhook(request: Request):
    from app.modules.identity_access.service import apply_resend_webhook

    body = await request.body()
    return apply_resend_webhook(body, request.headers)

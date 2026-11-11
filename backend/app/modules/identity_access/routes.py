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
    LocaleUpdate,
    Login,
    MailRequest,
    MailRequestView,
    Register,
    ResendWebhookView,
    ResetRequest,
    SignedOutView,
    TokenRequest,
    TokenUsedView,
    VerificationMailView,
    VerificationStatusView,
)
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


@router.get("/auth/me", response_model=AccountView)
def me(request: Request):
    with transaction() as db:
        a, s = account(db, request, verified=False)
        return auth.account_view(db, a, s.csrf_token)


@router.put("/account/locale", response_model=AccountView)
def update_locale(body: LocaleUpdate, request: Request):
    with transaction() as db:
        a, s = account(db, request, mutation=True, verified=False)
        auth.set_locale(a, body.locale)
        return auth.account_view(db, a, s.csrf_token)


@router.post("/auth/logout", response_model=SignedOutView)
def logout(request: Request, response: Response):
    with transaction() as db:
        _, s = account(db, request, True, False)
        db.delete(s)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"status": "SIGNED_OUT"}


@router.post("/auth/verify", response_model=TokenUsedView)
def verify(body: TokenRequest, request: Request):
    auth_limit(request, "verify")
    return auth.use_token(body.token, "verify")


@router.post("/auth/verification-email", response_model=VerificationMailView)
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


@router.post("/auth/forgot-password", response_model=MailRequestView)
def forgot(body: MailRequest, request: Request):
    auth_limit(request, "mail")
    result = auth.request_email(body.email, "reset")
    # Only what every caller gets: the delivery receipt exists only for a registered email.
    return {"status": result["status"], "message": result["message"]}


@router.post("/auth/reset-password", response_model=TokenUsedView)
def reset(body: ResetRequest, request: Request):
    auth_limit(request, "reset")
    return auth.use_token(body.token, "reset", body.password)


@router.post("/webhooks/resend", response_model=ResendWebhookView)
async def resend_webhook(request: Request):
    from app.modules.identity_access.service import apply_resend_webhook

    body = await request.body()
    return apply_resend_webhook(body, request.headers)

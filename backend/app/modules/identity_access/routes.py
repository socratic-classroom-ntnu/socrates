"""Account endpoints: register, login, session, email verification and password reset."""

from fastapi import APIRouter

from fastapi import Request, Response
from app.modules.identity_access import auth as auth
from app.modules.identity_access.service import (
    account,
    auth_limit,
    same_origin,
    set_session_cookie as _set_session_cookie,
)
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.identity_access.contracts import (
    AccountView,
    GuestJoin,
    ProfileUpdate,
    GuestUpgrade,
    LocaleUpdate,
    Login,
    LoginView,
    MailRequest,
    MailRequestView,
    PasswordResetView,
    Register,
    ResendWebhookView,
    ResetRequest,
    SignedOutView,
    TokenRequest,
    VerificationMailView,
    VerificationStatusView,
    VerifiedView,
    AvatarUpload,
    ChangePasswordRequest,
    ChangePasswordView,
    DeleteAccountRequest,
    DeleteAccountView,
    DeleteAccountCoursesView,
)
from app.modules.identity_access import avatar
from app.modules.identity_access.account_deletion import (
    anonymize_account,
    owned_courses,
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


@router.post("/auth/login", response_model=LoginView)
def login(body: Login, request: Request, response: Response):
    auth_limit(request, "login")
    # The session cookie may be a guest's, whose records then move to this account; the cookie
    # is SameSite=Lax, and checking the origin too keeps another site from steering them.
    current = request.cookies.get(auth.COOKIE)
    if current:
        same_origin(request)
    token, result = auth.login(body, current)
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


@router.patch("/account/profile", response_model=AccountView)
def update_profile(body: ProfileUpdate, request: Request):
    with transaction() as db:
        a, s = account(
            db,
            request,
            mutation=True,
            verified=False,
        )
        a.display_name_override = body.display_name
        return auth.account_view(db, a, s.csrf_token)


@router.put("/account/password", response_model=ChangePasswordView)
def update_password(body: ChangePasswordRequest, request: Request):
    with transaction() as db:
        a, _ = account(
            db,
            request,
            mutation=True,
            verified=False,
        )

        return auth.change_password(
            db,
            a,
            body.current_password,
            body.new_password,
        )


@router.put("/account/avatar", response_model=AccountView)
def put_account_avatar(body: AvatarUpload, request: Request):
    with transaction() as db:
        a, s = account(db, request, mutation=True, verified=False)
        avatar.save(db, a.id, body.mime, avatar.decode(body.mime, body.data_base64))
        return auth.account_view(db, a, s.csrf_token)


@router.get(
    "/account/avatar",
    response_model=bytes,
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}}}},
)
def get_account_avatar(request: Request) -> Response:
    """The picture itself, for <img>: the page adds ?v=<avatar_updated_at> so a new one is read.

    Typed as bytes so the contract gate sees a response model; returning a Response skips it.
    """
    with transaction() as db:
        a, _ = account(db, request, verified=False)
        mime, image = avatar.read(db, a.id)
    return Response(image, media_type=mime, headers={"Cache-Control": "private, no-cache"})


@router.get(
    "/account/deletion-check",
    response_model=DeleteAccountCoursesView,
)
def check_account_deletion(request: Request):
    """Check whether the current account can be deleted."""

    with transaction() as db:
        a, _ = account(
            db,
            request,
            verified=False,
        )

        courses = owned_courses(db, a.id)

        return {
            "can_delete": (a.kind == "registered" and len(courses) == 0),
            "courses": courses,
        }


@router.delete("/account/avatar", response_model=AccountView)
def delete_account_avatar(request: Request):
    with transaction() as db:
        a, s = account(db, request, mutation=True, verified=False)
        avatar.remove(db, a.id)
        return auth.account_view(db, a, s.csrf_token)


@router.delete("/account", response_model=DeleteAccountView)
def delete_account(
    body: DeleteAccountRequest,
    request: Request,
    response: Response,
):
    with transaction() as db:
        a, _ = account(
            db,
            request,
            mutation=True,
            verified=False,
        )

        # Require the current username, ignoring surrounding
        # whitespace and letter case.
        if body.username.strip().casefold() != a.username.casefold():
            raise DomainError("ACCOUNT_USERNAME_MISMATCH", 400)

        # Lock the account row before changing its identity.
        locked = db.get(type(a), a.id, with_for_update=True)

        anonymize_account(db, locked)

    response.delete_cookie(auth.COOKIE, path="/")

    return {"status": "ACCOUNT_DELETED"}


@router.post("/auth/logout", response_model=SignedOutView)
def logout(request: Request, response: Response):
    with transaction() as db:
        _, s = account(db, request, True, False, allow_guest=True)
        db.delete(s)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"status": "SIGNED_OUT"}


@router.post("/auth/verify", response_model=VerifiedView)
def verify(body: TokenRequest, request: Request):
    auth_limit(request, "verify")
    return auth.use_token(body.token, "verify")


@router.post(
    "/auth/verification-email",
    response_model=VerificationMailView,
    response_model_exclude_unset=True,
)
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


@router.post("/auth/reset-password", response_model=PasswordResetView)
def reset(body: ResetRequest, request: Request):
    auth_limit(request, "reset")
    return auth.use_token(body.token, "reset", body.password)


@router.post(
    "/webhooks/resend", response_model=ResendWebhookView, response_model_exclude_unset=True
)
async def resend_webhook(request: Request):
    from app.modules.identity_access.service import apply_resend_webhook

    body = await request.body()
    return apply_resend_webhook(body, request.headers)

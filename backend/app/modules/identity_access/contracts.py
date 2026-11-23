"""Public contracts owned by Identity & Access."""

from typing import Annotated, Literal, Protocol

from pydantic import Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError
from sqlalchemy.orm import Session

from app.modules.platform.contracts import Strict

# Interface languages an account can choose; the frontend owns the translations.
Locale = Literal["zh-Hant", "zh-Hans", "en", "es"]
# Chosen at registration and fixed; not the role a course or classroom membership carries.
AccountRole = Literal["student", "teacher"]

USERNAME_PATTERN = r"^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$"

PASSWORD_SPECIALS = "!@#$%^&*_-+=.?~"

PASSWORD_MIN, PASSWORD_MAX = (
    8,
    32,
)  # Register／ResetRequest 的 Field 寫同樣的數字（前端測試逐字比對）

PASSWORD_RULE = (
    f"密碼需 {PASSWORD_MIN}–{PASSWORD_MAX} 個字元，並包含大寫字母、小寫字母、數字與特殊字元"
    f"（可用 {' '.join(PASSWORD_SPECIALS)}），不能有空白或其他符號。"
)


def password_policy(value: str) -> str:
    allowed = set(PASSWORD_SPECIALS)
    ok = (
        all((c.isascii() and c.isalnum()) or c in allowed for c in value)
        and any(c.isascii() and c.isupper() for c in value)
        and any(c.isascii() and c.islower() for c in value)
        and any(c.isdigit() and c.isascii() for c in value)
        and any(c in allowed for c in value)
    )
    if not ok:
        raise PydanticCustomError("password_policy", PASSWORD_RULE)
    return value


def email_shape(value: str) -> str:
    value = value.strip().casefold()
    if "@" not in value or "." not in value.rsplit("@", 1)[1]:
        raise ValueError("請填入可收信的 email")
    return value


class Credentials(Strict):
    username: str = Field(min_length=3, max_length=32, pattern=USERNAME_PATTERN)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=32)

    @field_validator("password")
    @classmethod
    def password_rule(cls, v: str) -> str:
        return password_policy(v)

    @field_validator("email")
    @classmethod
    def email_shape(cls, v: str) -> str:
        return email_shape(v)


class Register(Credentials):
    # Optional so other callers (the dev console) still register; the sign-up form always sends
    # it. Missing or null makes a student.
    account_role: AccountRole | None = None


class GuestJoin(Strict):
    """Joining without registering: a nickname shown to the class and the interface language."""

    # Surrounding spaces do not count: trimmed first, then 1–40 characters.
    nickname: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    locale: Locale


class GuestUpgrade(Credentials):
    """A guest registering keeps its account id and stays a student, so it sends no role."""


class Login(Strict):
    login: str = Field(max_length=254)
    password: str = Field(max_length=256)


class MailRequest(Strict):
    email: str = Field(max_length=254)


class TokenRequest(Strict):
    token: str = Field(max_length=512)


class ResetRequest(TokenRequest):
    password: str = Field(min_length=8, max_length=32)

    @field_validator("password")
    @classmethod
    def password_rule(cls, v: str) -> str:
        return password_policy(v)


class VerificationDelivery(Strict):
    mail_id: str
    delivery_state: str
    expires_at: float


class SignedOutView(Strict):
    status: Literal["SIGNED_OUT"]


class VerifiedView(Strict):
    status: Literal["VERIFIED"]


class PasswordResetView(Strict):
    status: Literal["PASSWORD_RESET"]


class AvatarUpload(Strict):
    """The cropped picture, shaped like a feedback screenshot: the browser sends JPEG."""

    mime: Literal["image/jpeg", "image/png"]
    data_base64: str


class ChangePasswordRequest(Strict):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=32)

    @field_validator("new_password")
    @classmethod
    def new_password_rule(cls, value: str) -> str:
        return password_policy(value)


class ChangePasswordView(Strict):
    status: Literal["PASSWORD_CHANGED"]


class DeleteAccountRequest(Strict):
    username: str = Field(min_length=1, max_length=64)


class DeleteAccountView(Strict):
    status: Literal["ACCOUNT_DELETED"]


class DeleteAccountCoursesView(Strict):
    can_delete: bool
    courses: list[str]


class MailRequestView(Strict):
    """POST /auth/forgot-password: the same answer whether or not the email has an account, so
    the endpoint cannot be used to learn which emails are registered."""

    status: Literal["REQUEST_RECORDED"]
    message: str


class VerificationMailView(Strict):
    """POST /auth/verification-email: the signed-in account's own verification mail."""

    status: Literal["REQUEST_RECORDED", "ALREADY_VERIFIED"]
    message: str
    # Absent (not null) when no mail was queued; the route excludes unset fields.
    delivery: VerificationDelivery | None = None


class ResendWebhookView(Strict):
    status: Literal["RECORDED"]
    matched: bool
    # Absent (not null) when no delivery matched; the route excludes unset fields.
    provider_status: str | None = None


class VerificationStatusDelivery(Strict):
    state: str
    provider: str | None = None
    provider_message_id: str | None = None
    provider_status: str | None = None
    attempts: int | None = None
    created_at: float | None = None
    updated_at: float | None = None
    sent_at: float | None = None
    delivered_at: float | None = None
    last_error: str | None = None
    preview_url: str | None = None


class VerificationStatusView(Strict):
    verified: bool
    email_masked: str
    authority_state: Literal["EMAIL_VERIFICATION", "FULL_PRODUCT"]
    delivery: VerificationStatusDelivery


class AccountView(Strict):
    id: str
    username: str
    email: str
    email_masked: str = ""
    verified: bool
    authority_state: Literal["EMAIL_VERIFICATION", "FULL_PRODUCT"] = "EMAIL_VERIFICATION"
    verification_delivery: VerificationDelivery | None = None
    csrf_token: str
    points: int
    achievements: list[str]
    locale: Locale | None = None
    kind: Literal["guest", "expired_guest", "registered", "deleted"] = "registered"
    account_role: AccountRole
    is_admin: bool = False
    # Guests only: 168 hours after joining; the daily job then clears the name and marks the
    # account expired_guest.
    guest_expires_at: float | None = None
    # The name to show: a guest's nickname (never the username's random suffix), otherwise the
    # username; empty once a guest has expired.
    display_name: str = ""
    # When the current avatar was saved; null without one. The picture is GET /account/avatar,
    # and the page adds this as ?v= so a new picture is read again.
    avatar_updated_at: float | None = None


# What logging in did with a guest session on the same device: MERGED (its records moved to
# this account), NONE (no live guest session, or a hook failed and the merge rolled back), or
# REFUSED_TEACHER (a teacher account logged in; the guest keeps its records and session).
GuestMerge = Literal["MERGED", "NONE", "REFUSED_TEACHER"]


class LoginView(AccountView):
    guest_merge: GuestMerge


class LocaleUpdate(Strict):
    locale: Locale


class ProfileUpdate(Strict):
    display_name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
            max_length=40,
        ),
    ]


class AccountRecordHook(Protocol):
    """What a module that keeps something tied to an account provides for deleting that account
    (the app shell registers it with service.register_account_hook). All run in the caller's
    transaction and never commit.

    blocking_courses: names of what keeps the account from being deleted (courses it owns).
    forget_sessions: drop what is bound to these login sessions; called before they are deleted.
    forget_account: drop the account's secrets and stop using what it set up; rows that other
    records point at stay.
    """

    def blocking_courses(self, db: Session, account_id: str) -> list[str]: ...

    def forget_sessions(self, db: Session, token_hashes: list[str]) -> None: ...

    def forget_account(self, db: Session, account_id: str) -> None: ...


class GuestRecordHook(Protocol):
    """What every module that keeps student records provides for guests (the app shell registers
    it with service.register_guest_hook). Both run in the caller's transaction and never commit.

    reassign: move the guest's records to the account the device just logged in as. When the same
    course or activity has records under both, keep the account's and delete the guest's.
    forget_name: clear the guest's name wherever the module stores it (no soft delete); the
    records themselves stay, so teacher statistics still count them. Called when the guest
    expires.
    """

    def reassign(self, db: Session, guest_id: str, account_id: str) -> None: ...

    def forget_name(self, db: Session, guest_id: str) -> None: ...

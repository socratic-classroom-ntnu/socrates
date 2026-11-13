"""Public contracts owned by Identity & Access."""

from typing import Literal

from pydantic import Field, field_validator
from pydantic_core import PydanticCustomError
from app.modules.platform.contracts import Strict

# Interface languages an account can choose; the frontend owns the translations.
Locale = Literal["zh-Hant", "zh-Hans", "en", "es"]

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


class Register(Strict):
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


class GuestJoin(Strict):
    """Joining without registering: a nickname shown to the class and the interface language."""

    nickname: str = Field(min_length=1, max_length=40)
    locale: Locale


class GuestUpgrade(Register):
    """A guest registering keeps its account id; it sends exactly what a registration does."""


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
    kind: Literal["guest", "expired_guest", "registered"] = "registered"
    # Guests only: 168 hours after joining; the daily job then clears the name and marks the
    # account expired_guest.
    guest_expires_at: float | None = None


class LocaleUpdate(Strict):
    locale: Locale

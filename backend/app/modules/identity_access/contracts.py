"""Public contracts owned by Identity & Access."""

from typing import Literal

from pydantic import Field, field_validator
from pydantic_core import PydanticCustomError
from app.modules.platform.contracts import Strict

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
        v = v.strip().casefold()
        if "@" not in v or "." not in v.rsplit("@", 1)[1]:
            raise ValueError("請填入可收信的 email")
        return v


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

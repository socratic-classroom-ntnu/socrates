"""帳號名與密碼規則：只在設定新密碼（註冊、重設）時檢查，登入不檢查格式。"""

import pytest
from pydantic import ValidationError

from app.api.classroom_schemas import (
    PASSWORD_MAX,
    PASSWORD_MIN,
    PASSWORD_SPECIALS,
    Login,
    Register,
    ResetRequest,
)


def problems(**fields):
    body = {"username": "goose", "email": "goose@example.org", "password": "Socratic-1", **fields}
    try:
        Register(**body)
    except ValidationError as exc:
        return [(e["loc"][-1], e["type"]) for e in exc.errors()]
    return []


def test_password_needs_upper_lower_digit_and_special():
    assert problems() == []
    assert problems(password="socratic-1") == [("password", "password_policy")]
    assert problems(password="SOCRATIC-1") == [("password", "password_policy")]
    assert problems(password="Socratic-x") == [("password", "password_policy")]
    assert problems(password="Socratic12") == [("password", "password_policy")]


def test_password_length_is_8_to_32():
    assert problems(password="Ab-1abc") == [("password", "string_too_short")]
    assert problems(password="Ab-1" + "a" * 4) == []
    assert problems(password="Ab-1" + "a" * 28) == []
    assert problems(password="Ab-1" + "a" * 29) == [("password", "string_too_long")]


@pytest.mark.parametrize("char", ["'", '"', "`", "\\", ";", "<", ">", "/", " ", "(", "|", "密"])
def test_password_rejects_characters_outside_the_allowed_set(char):
    assert problems(password=f"Socratic-1{char}a") == [("password", "password_policy")]


def test_every_allowed_special_character_is_accepted():
    for char in PASSWORD_SPECIALS:
        assert problems(password=f"Socratic1{char}") == [], char


@pytest.mark.parametrize(
    ("name", "ok"),
    [
        ("goose", True),
        ("Goose_2026", True),
        ("a.b-c", True),
        ("ab", False),
        ("a" * 33, False),
        ("1goose", False),
        ("goose.", False),
        ("goo se", False),
        ("張三豐", False),
        ("goose'--", False),
    ],
)
def test_username_rule(name, ok):
    assert (problems(username=name) == []) is ok


def test_reset_uses_the_same_password_rule():
    with pytest.raises(ValidationError):
        ResetRequest(token="t", password="weakpassword")
    assert ResetRequest(token="t", password="Socratic-1").password == "Socratic-1"


def test_login_accepts_passwords_set_under_the_old_rule():
    assert Login(login="張三豐", password="correct horse battery staple").password


def test_field_limits_match_the_rule_constants():
    for model in (Register, ResetRequest):
        meta = {type(m).__name__: m for m in model.model_fields["password"].metadata}
        assert (meta["MinLen"].min_length, meta["MaxLen"].max_length) == (PASSWORD_MIN, PASSWORD_MAX)

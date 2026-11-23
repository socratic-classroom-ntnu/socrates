
from types import SimpleNamespace

from app.modules.identity_access.auth import display_name


def make_account(
    username: str,
    kind: str = "registered",
    display_name_override: str | None = None,
):
    return SimpleNamespace(
        username=username,
        kind=kind,
        display_name_override=display_name_override,
    )


def test_registered_account_uses_custom_display_name():
    account = make_account(
        username="estella123",
        display_name_override="小慧",
    )

    assert display_name(account) == "小慧"


def test_registered_account_without_custom_name_uses_username():
    account = make_account(username="estella123")

    assert display_name(account) == "estella123"


def test_guest_keeps_original_nickname():
    account = make_account(
        username="小慧-12345678",
        kind="guest",
    )

    assert display_name(account) == "小慧"


def test_expired_guest_has_no_display_name():
    account = make_account(
        username="小慧-12345678",
        kind="expired_guest",
    )

    assert display_name(account) == ""

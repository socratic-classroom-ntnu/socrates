"""A guest's name as people see it, and a guest made inside another module's transaction.

The username carries a random suffix so two guests may share a nickname; nobody should see it.
Joining a course as a guest creates the guest and the enrollment together, so the account module
offers the creation as a step of the caller's transaction.
"""

import pytest
from sqlalchemy import func, select

from app.modules.identity_access import service as identity
from app.modules.identity_access.repositories import Account, LoginSession
from app.modules.platform import storage
from tests.classroom.test_guest_accounts import UPGRADE, client, join  # noqa: F401


def accounts() -> int:
    with storage.transaction() as db:
        return db.scalar(select(func.count()).select_from(Account))


def test_a_guest_is_shown_by_the_nickname_alone(client):  # noqa: F811
    view = join(client, nickname="小-明").json()
    assert view["display_name"] == "小-明"
    assert view["username"] != "小-明"
    assert client.get("/api/v2/auth/me").json()["display_name"] == "小-明"


def test_a_registered_account_is_shown_by_its_username(client):  # noqa: F811
    join(client)
    upgraded = client.post("/api/v2/auth/guest/upgrade", json=UPGRADE)
    assert upgraded.status_code == 200, upgraded.text
    assert upgraded.json()["display_name"] == "ming"


def test_the_nickname_is_trimmed_before_it_is_checked(client):  # noqa: F811
    assert join(client, nickname="  小明  ").json()["display_name"] == "小明"
    client.cookies.clear()
    blank = client.post("/api/v2/auth/guest", json={"nickname": "   ", "locale": "en"})
    assert blank.status_code == 422
    long = client.post("/api/v2/auth/guest", json={"nickname": " " + "字" * 41, "locale": "en"})
    assert long.status_code == 422


def test_a_guest_made_in_the_callers_transaction_leaves_nothing_when_it_rolls_back(client):  # noqa: F811
    before = accounts()
    with pytest.raises(RuntimeError):
        with storage.transaction() as db:
            token, view = identity.create_guest(db, "小明", "zh-Hant")
            assert token and view["kind"] == "guest" and view["display_name"] == "小明"
            raise RuntimeError("the enrollment failed")
    assert accounts() == before
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(LoginSession)) == 0


def test_a_guest_made_in_the_callers_transaction_signs_in(client):  # noqa: F811
    with storage.transaction() as db:
        token, view = identity.create_guest(db, "小明", "en")
    client.cookies.set(identity.COOKIE, token)
    me = client.get("/api/v2/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["id"] == view["id"]

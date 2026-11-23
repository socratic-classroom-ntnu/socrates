"""Tests for changing a signed-in account's password."""

from sqlalchemy import select

from app.modules.ai_providers.repositories import ProviderProfile, SessionProviderSecret
from app.modules.identity_access.repositories import Account, LoginSession
from app.modules.platform import storage
from tests.course_management.conftest import PASSWORD, switch, user

PASSWORD_URL = "/api/v2/account/password"
NEW_PASSWORD = "NewPassword123!"


def change_password(client, current=PASSWORD, new=NEW_PASSWORD):
    return client.put(
        PASSWORD_URL,
        json={
            "current_password": current,
            "new_password": new,
        },
    )


def test_change_password_success(client):
    user(client, "learner")

    response = change_password(client)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "PASSWORD_CHANGED"


def test_new_password_can_login(client):
    user(client, "learner")

    response = change_password(client)
    assert response.status_code == 200, response.text

    login = client.post(
        "/api/v2/auth/login",
        json={"login": "learner", "password": NEW_PASSWORD},
    )

    assert login.status_code == 200, login.text


def test_old_password_cannot_login(client):
    user(client, "learner")

    response = change_password(client)
    assert response.status_code == 200, response.text

    login = client.post(
        "/api/v2/auth/login",
        json={"login": "learner", "password": PASSWORD},
    )

    assert login.status_code == 401, login.text


def test_wrong_current_password(client):
    user(client, "learner")

    response = change_password(
        client,
        current="WrongPassword123!",
    )

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "CURRENT_PASSWORD_INVALID"


def test_the_new_password_may_be_the_current_one(client):
    user(client, "learner")

    response = change_password(client, current=PASSWORD, new=PASSWORD)

    assert response.status_code == 200, response.text


def test_reject_invalid_new_password(client):
    user(client, "learner")

    invalid_passwords = [
        "short1!",
        "lowercase123!",
        "UPPERCASE123!",
        "NoNumbers!",
        "NoSpecial123",
        "Password With Space123!",
        "A" * 33 + "a1!",
    ]

    for new_password in invalid_passwords:
        response = change_password(client, new=new_password)
        assert response.status_code == 422, (
            new_password,
            response.text,
        )


def test_requires_login(client):
    response = change_password(client)
    assert response.status_code == 401, response.text


def test_requires_csrf(client):
    user(client, "learner")
    client.headers["X-CSRF-Token"] = "wrong"

    response = change_password(client)

    assert response.status_code == 403, response.text


def test_guest_cannot_change_password(client):
    response = client.post(
        "/api/v2/auth/guest",
        json={"nickname": "小明", "locale": "en"},
    )
    assert response.status_code == 200, response.text

    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]

    result = change_password(client)

    assert result.status_code == 403, result.text
    assert result.json()["detail"] == "GUEST_NOT_ALLOWED"


def test_password_unchanged_after_failed_attempt(client):
    user(client, "learner")

    response = change_password(
        client,
        current="WrongPassword123!",
    )
    assert response.status_code == 400, response.text

    login = client.post(
        "/api/v2/auth/login",
        json={"login": "learner", "password": PASSWORD},
    )

    assert login.status_code == 200, login.text


def sessions_of(username):
    with storage.transaction() as db:
        account = db.scalar(select(Account).where(Account.username == username))
        return list(
            db.scalars(select(LoginSession.token_hash).where(LoginSession.account_id == account.id))
        )


def test_other_devices_are_signed_out_and_this_one_stays(client):
    user(client, "learner")
    other_device = sessions_of("learner")
    switch(client, {"username": "learner"})  # signing in again, as on a second device
    assert len(sessions_of("learner")) == len(other_device) + 1

    assert change_password(client).status_code == 200

    remaining = sessions_of("learner")
    assert len(remaining) == 1
    assert remaining[0] not in other_device
    assert client.get("/api/v2/auth/me").status_code == 200


def test_a_key_kept_for_another_device_goes_with_that_session(client):
    user(client, "learner")
    other_device = sessions_of("learner")[0]
    with storage.transaction() as db:
        account = db.scalar(select(Account).where(Account.username == "learner"))
        profile = ProviderProfile(
            owner_id=account.id, name="mine", adapter="openai", default_model="m"
        )
        db.add(profile)
        db.flush()
        db.add(
            SessionProviderSecret(
                profile_id=profile.id,
                session_token_hash=other_device,
                encrypted_secret="secret",
                secret_last4="1234",
                expires_at=9_999_999_999,
            )
        )
    switch(client, {"username": "learner"})

    assert change_password(client).status_code == 200

    with storage.transaction() as db:
        assert db.scalars(select(SessionProviderSecret)).all() == []


def test_five_tries_per_ten_minutes_then_refused(client):
    user(client, "learner")

    codes = [change_password(client, current="Wrong-123456!").status_code for _ in range(5)]
    sixth = change_password(client)

    assert codes == [400] * 5
    assert sixth.status_code == 429
    assert sixth.json()["detail"] == "PASSWORD_CHANGE_RATE_LIMITED"

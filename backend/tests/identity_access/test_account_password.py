
"""Tests for changing a signed-in account's password."""

from tests.course_management.conftest import PASSWORD, user, client

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


def test_reject_same_password(client):
    user(client, "learner")

    response = change_password(
        client,
        current=PASSWORD,
        new=PASSWORD,
    )

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "PASSWORD_UNCHANGED"


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

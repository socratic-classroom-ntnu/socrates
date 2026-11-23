from tests.course_management.conftest import PASSWORD, user


def test_update_display_name_roundtrip(client):
    user(client, "learner")

    response = client.patch(
        "/api/v2/account/profile",
        json={"display_name": "  小慧  "},
    )

    assert response.status_code == 200, response.text
    assert response.json()["display_name"] == "小慧"
    assert response.json()["username"] == "learner"

    me = client.get("/api/v2/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "小慧"

    login = client.post(
        "/api/v2/auth/login",
        json={"login": "learner", "password": PASSWORD},
    )
    assert login.status_code == 200
    assert login.json()["display_name"] == "小慧"


def test_display_name_defaults_to_username(client):
    user(client, "learner")

    response = client.get("/api/v2/auth/me")

    assert response.status_code == 200
    assert response.json()["display_name"] == "learner"


def test_display_name_validation(client):
    user(client, "learner")

    invalid_names = [
        "",
        "   ",
        "a" * 41,
        None,
        123,
    ]

    for name in invalid_names:
        response = client.patch(
            "/api/v2/account/profile",
            json={"display_name": name},
        )
        assert response.status_code == 422, response.text


def test_display_name_accepts_40_characters(client):
    user(client, "learner")

    name = "中" * 40
    response = client.patch(
        "/api/v2/account/profile",
        json={"display_name": name},
    )

    assert response.status_code == 200, response.text
    assert response.json()["display_name"] == name


def test_profile_requires_csrf(client):
    user(client, "learner")
    client.headers["X-CSRF-Token"] = "wrong"

    response = client.patch(
        "/api/v2/account/profile",
        json={"display_name": "小慧"},
    )

    assert response.status_code == 403


def test_profile_requires_login(client):
    response = client.patch(
        "/api/v2/account/profile",
        json={"display_name": "小慧"},
    )

    assert response.status_code == 401


def test_guest_cannot_update_display_name(client):
    response = client.post(
        "/api/v2/auth/guest",
        json={
            "nickname": "小明",
            "locale": "en",
        },
    )

    assert response.status_code == 200, response.text

    guest = response.json()
    client.headers["X-CSRF-Token"] = guest["csrf_token"]

    update = client.patch(
        "/api/v2/account/profile",
        json={"display_name": "新的名稱"},
    )

    assert update.status_code == 403, update.text
    assert update.json()["detail"] == "GUEST_NOT_ALLOWED"

    me = client.get("/api/v2/auth/me")

    assert me.status_code == 200
    assert me.json()["display_name"] == "小明"

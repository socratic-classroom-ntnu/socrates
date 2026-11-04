from tests.course_management.conftest import PASSWORD, user


def test_new_account_has_no_locale(client):
    account = user(client, "learner")

    assert account["locale"] is None
    assert client.get("/api/v2/auth/me").json()["locale"] is None


def test_set_locale_roundtrip(client):
    user(client, "learner")

    response = client.put("/api/v2/account/locale", json={"locale": "es"})

    assert response.status_code == 200, response.text
    assert response.json()["locale"] == "es"
    assert client.get("/api/v2/auth/me").json()["locale"] == "es"
    login = client.post("/api/v2/auth/login", json={"login": "learner", "password": PASSWORD})
    assert login.json()["locale"] == "es"


def test_reject_unknown_locale(client):
    user(client, "learner")

    for value in ("zh-TW", "fr", "", None):
        assert client.put("/api/v2/account/locale", json={"locale": value}).status_code == 422
    assert client.get("/api/v2/auth/me").json()["locale"] is None


def test_locale_requires_csrf(client):
    user(client, "learner")
    client.headers["X-CSRF-Token"] = "wrong"

    response = client.put("/api/v2/account/locale", json={"locale": "en"})

    assert response.status_code == 403


def test_locale_requires_login(client):
    response = client.put("/api/v2/account/locale", json={"locale": "en"})

    assert response.status_code == 401

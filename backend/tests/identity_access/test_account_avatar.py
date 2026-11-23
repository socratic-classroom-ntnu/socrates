"""Account avatar: stored in the database, sent as base64 JSON, read back as the image itself."""

import base64

from sqlalchemy import select

from app.modules.identity_access.repositories import AccountAvatar
from app.modules.platform import storage
from tests.course_management.conftest import PASSWORD, user

AVATAR_URL = "/api/v2/account/avatar"
# Only the file header is checked, so a header plus filler stands in for a real image.
JPEG = b"\xff\xd8\xff\xe0" + b"j" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"p" * 64
LIMIT = 200 * 1024


def put(client, data: bytes, mime: str = "image/jpeg"):
    return client.put(
        AVATAR_URL, json={"mime": mime, "data_base64": base64.b64encode(data).decode()}
    )


def test_upload_shows_in_the_account_and_reads_back_as_the_image(client):
    user(client, "learner")

    response = put(client, JPEG)

    assert response.status_code == 200, response.text
    version = response.json()["avatar_updated_at"]
    assert isinstance(version, float)
    assert client.get("/api/v2/auth/me").json()["avatar_updated_at"] == version
    image = client.get(f"{AVATAR_URL}?v={version}")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content == JPEG


def test_png_is_accepted_too(client):
    user(client, "learner")

    response = put(client, PNG, "image/png")

    assert response.status_code == 200, response.text
    image = client.get(AVATAR_URL)
    assert image.headers["content-type"] == "image/png"
    assert image.content == PNG


def test_a_new_upload_replaces_the_old_one_and_moves_the_version(client):
    user(client, "learner")
    first = put(client, JPEG).json()["avatar_updated_at"]

    second = put(client, PNG, "image/png").json()["avatar_updated_at"]

    assert second > first
    assert client.get(AVATAR_URL).content == PNG
    with storage.transaction() as db:
        assert len(db.scalars(select(AccountAvatar)).all()) == 1


def test_delete_goes_back_to_the_letter_avatar(client):
    user(client, "learner")
    put(client, JPEG)

    response = client.delete(AVATAR_URL)

    assert response.status_code == 200, response.text
    assert response.json()["avatar_updated_at"] is None
    assert client.get("/api/v2/auth/me").json()["avatar_updated_at"] is None
    missing = client.get(AVATAR_URL)
    assert missing.status_code == 404
    assert missing.json()["detail"] == "AVATAR_NOT_FOUND"


def test_without_an_avatar_reading_it_is_not_found(client):
    user(client, "learner")

    assert client.get("/api/v2/auth/me").json()["avatar_updated_at"] is None
    assert client.get(AVATAR_URL).json()["detail"] == "AVATAR_NOT_FOUND"


def test_the_limit_is_200_kb_of_image(client):
    user(client, "learner")

    assert put(client, JPEG[:4] + b"j" * (LIMIT - 4)).status_code == 200
    too_large = put(client, JPEG[:4] + b"j" * (LIMIT - 3))
    assert too_large.status_code == 422
    assert too_large.json()["detail"] == "AVATAR_INVALID"


def test_only_png_and_jpeg_headers_that_match_the_mime(client):
    user(client, "learner")

    for data, mime in ((PNG, "image/jpeg"), (JPEG, "image/png"), (b"GIF89a....", "image/jpeg")):
        response = put(client, data, mime)
        assert response.status_code == 422, (mime, response.text)
        assert response.json()["detail"] == "AVATAR_INVALID"
    webp = put(client, b"RIFF0000WEBP", "image/webp")
    assert webp.status_code == 422


def test_broken_base64_and_empty_images_are_refused(client):
    user(client, "learner")

    broken = client.put(AVATAR_URL, json={"mime": "image/jpeg", "data_base64": "not base64!"})
    assert broken.status_code == 422
    assert broken.json()["detail"] == "AVATAR_INVALID"
    assert put(client, b"").status_code == 422


def test_an_unverified_account_can_set_its_avatar(client):
    body = {
        "username": "fresh",
        "email": "fresh@example.org",
        "password": PASSWORD,
        "account_role": "student",
    }
    registered = client.post("/api/v2/auth/register", json=body)
    assert registered.status_code == 200, registered.text
    client.headers["X-CSRF-Token"] = registered.json()["csrf_token"]

    assert put(client, JPEG).status_code == 200


def test_reading_needs_a_login(client):
    user(client, "learner")
    put(client, JPEG)
    client.post("/api/v2/auth/logout")

    assert client.get(AVATAR_URL).status_code == 401


def test_deleting_the_account_removes_the_avatar(client):
    user(client, "learner")
    put(client, JPEG)

    deleted = client.request("DELETE", "/api/v2/account", json={"username": "learner"})

    assert deleted.status_code == 200, deleted.text
    with storage.transaction() as db:
        assert db.scalars(select(AccountAvatar)).all() == []

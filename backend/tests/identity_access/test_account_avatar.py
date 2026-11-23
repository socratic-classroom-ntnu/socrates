
"""Tests for account avatar upload, retrieval and deletion."""

from io import BytesIO

from PIL import Image

from tests.course_management.conftest import user, client


AVATAR_URL = "/api/v2/account/avatar"


def make_image(
    image_format="PNG",
    size=(256, 256),
):
    """Generate an actual image without depending on external files."""
    output = BytesIO()
    image = Image.new("RGB", size, color=(100, 150, 200))
    image.save(output, format=image_format)
    return output.getvalue()


def upload(client, data, filename="avatar.png", content_type="image/png"):
    return client.post(
        AVATAR_URL,
        files={"file": (filename, data, content_type)},
    )


def test_avatar_upload_png_and_read(client, tmp_path, monkeypatch):
    from app.modules.identity_access import avatar

    monkeypatch.setattr(avatar, "AVATAR_DIR", tmp_path)
    user(client, "learner")

    response = upload(client, make_image())

    assert response.status_code == 200, response.text
    avatar_url = response.json()["avatar_url"]
    assert avatar_url is not None

    me = client.get("/api/v2/auth/me")
    assert me.status_code == 200
    assert me.json()["avatar_url"] == avatar_url

    image_response = client.get("/api/v2" + avatar_url)
    assert image_response.status_code == 200
    assert image_response.headers["content-type"].startswith("image/png")

    with Image.open(BytesIO(image_response.content)) as image:
        assert image.size == (256, 256)
        assert image.format == "PNG"


def test_avatar_upload_jpeg(client, tmp_path, monkeypatch):
    from app.modules.identity_access import avatar

    monkeypatch.setattr(avatar, "AVATAR_DIR", tmp_path)
    user(client, "learner")

    response = upload(
        client,
        make_image(image_format="JPEG"),
        filename="avatar.jpg",
        content_type="image/jpeg",
    )

    assert response.status_code == 200, response.text
    assert response.json()["avatar_url"] is not None


def test_avatar_replace_removes_previous_file(client, tmp_path, monkeypatch):
    from app.modules.identity_access import avatar

    monkeypatch.setattr(avatar, "AVATAR_DIR", tmp_path)
    user(client, "learner")

    first = upload(client, make_image())
    assert first.status_code == 200, first.text
    first_url = first.json()["avatar_url"]
    first_filename = first_url.rsplit("/", 1)[-1]
    assert (tmp_path / first_filename).exists()

    second = upload(client, make_image(image_format="JPEG"), "new.jpg", "image/jpeg")
    assert second.status_code == 200, second.text

    second_url = second.json()["avatar_url"]
    assert second_url != first_url
    assert not (tmp_path / first_filename).exists()


def test_avatar_delete(client, tmp_path, monkeypatch):
    from app.modules.identity_access import avatar

    monkeypatch.setattr(avatar, "AVATAR_DIR", tmp_path)
    user(client, "learner")

    uploaded = upload(client, make_image())
    assert uploaded.status_code == 200, uploaded.text

    avatar_url = uploaded.json()["avatar_url"]
    filename = avatar_url.rsplit("/", 1)[-1]

    response = client.delete(AVATAR_URL)

    assert response.status_code == 200, response.text
    assert response.json()["avatar_url"] is None
    assert not (tmp_path / filename).exists()

    me = client.get("/api/v2/auth/me")
    assert me.json()["avatar_url"] is None


def test_avatar_rejects_oversized_file(client):
    user(client, "learner")

    response = upload(
        client,
        b"x" * (5 * 1024 * 1024 + 1),
    )

    assert response.status_code == 413, response.text
    assert response.json()["detail"] == "REQUEST_SIZE"


def test_avatar_rejects_invalid_image(client):
    user(client, "learner")

    response = upload(
        client,
        b"not a real image",
    )

    assert response.status_code == 400, response.text


def test_avatar_rejects_non_square_image(client):
    user(client, "learner")

    response = upload(
        client,
        make_image(size=(300, 200)),
    )

    assert response.status_code == 400, response.text


def test_avatar_requires_login(client):
    response = upload(client, make_image())

    assert response.status_code == 401, response.text


def test_avatar_requires_csrf(client):
    user(client, "learner")
    client.headers["X-CSRF-Token"] = "wrong"

    response = upload(client, make_image())

    assert response.status_code == 403, response.text


def test_guest_cannot_upload_avatar(client):
    response = client.post(
        "/api/v2/auth/guest",
        json={"nickname": "小明", "locale": "en"},
    )
    assert response.status_code == 200, response.text

    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]

    result = upload(client, make_image())

    assert result.status_code == 403, result.text
    assert result.json()["detail"] == "GUEST_NOT_ALLOWED"

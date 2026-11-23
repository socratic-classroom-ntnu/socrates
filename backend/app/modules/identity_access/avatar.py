
"""Validation and persistent storage for account profile pictures."""

from io import BytesIO
from pathlib import Path
from uuid import uuid4
import os

from PIL import Image, UnidentifiedImageError

from app.modules.platform.errors import DomainError


AVATAR_DIR = Path(os.environ.get("SOCRATES_AVATAR_DIR", "/data/avatars"))
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
OUTPUT_SIZE = (256, 256)


def save_avatar(data: bytes) -> str:
    """Validate an uploaded image and return its generated filename."""
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise DomainError("AVATAR_SIZE_INVALID", 400)

    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in ("JPEG", "PNG"):
                raise DomainError("AVATAR_FORMAT_INVALID", 400)

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise DomainError("AVATAR_DIMENSIONS_INVALID", 400)

            image.load()
            if image.size != OUTPUT_SIZE:
                raise DomainError("AVATAR_CROP_INVALID", 400)
            image = image.convert("RGB")
            image.thumbnail(OUTPUT_SIZE)

            # Frontend will provide a square cropped image.
            if image.size != OUTPUT_SIZE:
                raise DomainError("AVATAR_CROP_INVALID", 400)

            output = BytesIO()
            image.save(output, format="PNG")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise DomainError("AVATAR_FORMAT_INVALID", 400) from exc

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid4().hex}.png"
    destination = AVATAR_DIR / filename
    destination.write_bytes(output.getvalue())
    return filename


def avatar_path(filename: str) -> Path:
    """Resolve a generated filename without allowing directory traversal."""
    if (
        len(filename) != 36
        or not filename.endswith(".png")
        or any(character not in "0123456789abcdef" for character in filename[:-4])
    ):
        raise DomainError("AVATAR_NOT_FOUND", 404)

    return AVATAR_DIR / filename


def delete_avatar(filename: str | None) -> None:
    if filename:
        avatar_path(filename).unlink(missing_ok=True)

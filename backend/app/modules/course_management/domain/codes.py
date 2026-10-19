"""Opaque course enrollment codes."""

import secrets

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def normalize(raw: str) -> str:
    return raw.strip().upper()

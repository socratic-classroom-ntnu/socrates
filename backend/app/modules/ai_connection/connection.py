"""A teacher's AI 連線設定: what is in use, the 系統 AI they can choose instead, and saving their
one connection (需求〈只有一組連線，全部 AI 共用〉).

Provider calls never run inside a database transaction: routes read (transaction), test the
connection, then write (transaction), and the write checks nobody changed it in between.
"""

from dataclasses import dataclass, replace
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from app.modules.ai_connection import service as checks
from app.modules.ai_connection.contracts import (
    AIConnectionInput,
    AIConnectionModelsInput,
    AIConnectionView,
    AIConnectionOwnView,
    AIConnectionSystemView,
)
from app.modules.ai_providers import service as ai_service
from app.modules.course_management import service as course_service
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform.toggles import toggle_enabled

PREFIX = "AI_CONNECTION"
NAME_LIMIT = 100  # provider_profiles.name
SERVICE_NAMES = {
    "openrouter": "OpenRouter",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
}


def require_teacher(account: Account) -> None:
    if account.account_role != "teacher":
        raise DomainError("ACCOUNT_ROLE_FORBIDDEN", 403)


# ---- 讀取 ----------------------------------------------------------------------------------


def system_option(db: Session) -> AIConnectionSystemView:
    """The 系統 AI not set up counts as the switch off (需求〈系統提供和自己的金鑰〉)."""
    row = ai_service.usable_platform_profile(db, course_service.practice_owner(db).id)
    if row is None:
        return AIConnectionSystemView(available=False, model=None)
    return AIConnectionSystemView(
        available=toggle_enabled(db, "system_ai_fallback"), model=row.default_model
    )


def view(db: Session, owner_id: str) -> AIConnectionView:
    own = ai_service.owner_connection(db, owner_id)
    return AIConnectionView(
        mode="own" if own is not None and own.enabled else "system",
        system=system_option(db),
        own=None
        if own is None
        else AIConnectionOwnView(
            adapter=own.adapter,
            model=own.model,
            base_url=own.base_url,
            name=own.name,
            key_last4=own.key_last4,
            enabled=own.enabled,
            key_usable=own.key_usable,
        ),
    )


# ---- 表單 ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Form:
    draft: checks.Draft
    # None = the teacher left it blank: the service's name, numbered when taken.
    name: str | None


def _same_address(draft: checks.Draft) -> checks.Draft:
    """The URL as the URL check saves it, so the same address typed with a trailing slash still
    keeps the saved key and the same row."""
    if draft.base_url is None:
        return draft
    return replace(draft, base_url=draft.base_url.rstrip("/"))


def check_form(body: AIConnectionInput) -> Form:
    """Every check that needs no database and no network; error codes only, never the key."""
    draft = _same_address(
        checks.check_fields(body.adapter, body.model, body.api_key, body.base_url, prefix=PREFIX)
    )
    name = None if checks.blank(body.name) else (body.name or "").strip()
    if name is not None and len(name) > NAME_LIMIT:
        raise DomainError("AI_CONNECTION_NAME_INVALID", 422)
    return Form(draft=draft, name=name)


def check_source(body: AIConnectionModelsInput) -> checks.Draft:
    """The model list's service, key and URL, checked like the form's."""
    return _same_address(
        checks.check_source(body.adapter, body.api_key, body.base_url, prefix=PREFIX)
    )


@dataclass(frozen=True)
class Current:
    """What the save is based on: compared again under the lock before writing."""

    connection: ai_service.OwnerConnection | None
    # The saved key with its service, for a blank form key; None when it cannot be used.
    stored: ai_service.PlatformConfig | None

    @property
    def seen(self) -> tuple[str, float] | None:
        own = self.connection
        return None if own is None else (own.profile_id, own.updated_at)

    def kept_row(self, draft: checks.Draft) -> str | None:
        """The row a save changes in place: same service at the same address; else a new row."""
        own = self.connection
        if own is None or own.adapter != draft.adapter:
            return None
        return own.profile_id if (own.base_url or None) == (draft.base_url or None) else None


def current(db: Session, owner_id: str) -> Current:
    return Current(
        connection=ai_service.owner_connection(db, owner_id),
        stored=ai_service.owner_connection_config(db, owner_id),
    )


def usage_config(db: Session, owner_id: str) -> ai_service.PlatformConfig | None:
    """The connection whose usage the page shows: the teacher's own in use with a usable key."""
    own = ai_service.owner_connection(db, owner_id)
    if own is None or not own.enabled:
        return None
    return ai_service.owner_connection_config(db, owner_id)


def check_name_free(db: Session, owner_id: str, form: Form, keep_id: str | None) -> None:
    """A name the teacher typed that another of their connections has (`owner_id + name` is
    unique). Checked before the test so the teacher hears it first, and again when saving."""
    if form.name is not None and ai_service.profile_name_taken(db, owner_id, form.name, keep_id):
        raise DomainError("AI_CONNECTION_NAME_TAKEN", 409)


def service_name(config: ai_service.PlatformConfig) -> str:
    if config.adapter in SERVICE_NAMES:
        return SERVICE_NAMES[config.adapter]
    # A compatible service has no product name; its host tells the teacher which one it is.
    return urlsplit(config.base_url or "").hostname or config.adapter


def free_name(db: Session, owner_id: str, base: str, keep_id: str | None) -> str:
    """The service's name, or "<name> 2", "<name> 3"… when the teacher already uses it."""
    number = 1
    while True:
        suffix = "" if number == 1 else f" {number}"
        name = base[: NAME_LIMIT - len(suffix)] + suffix
        if not ai_service.profile_name_taken(db, owner_id, name, keep_id):
            return name
        number += 1


def switch(db: Session, owner_id: str, mode: str) -> None:
    """系統提供 only while it can be used; the teacher's own only with a key it can still use.
    Neither tests the connection (需求：切回不用重填、不重新測試)."""
    ai_service.lock_owner(db, owner_id)
    if mode == "system":
        if not system_option(db).available:
            raise DomainError("AI_CONNECTION_SYSTEM_UNAVAILABLE", 409)
        ai_service.switch_owner_connection(db, owner_id, enabled=False)
        return
    own = ai_service.owner_connection(db, owner_id)
    if own is None or not own.key_usable:
        raise DomainError("AI_CONNECTION_NO_KEPT_KEY", 409)
    ai_service.switch_owner_connection(db, owner_id, enabled=True)


def save(
    db: Session,
    owner_id: str,
    form: Form,
    config: ai_service.PlatformConfig,
    seen: tuple[str, float] | None,
) -> None:
    """Write a tested connection unless it changed since `seen` (another tab's save or switch):
    the connection the teacher tested against is no longer the one in use."""
    ai_service.lock_owner(db, owner_id)
    now = current(db, owner_id)
    if now.seen != seen:
        raise DomainError("AI_CONNECTION_CHANGED", 409)
    keep_id = now.kept_row(form.draft)
    check_name_free(db, owner_id, form, keep_id)
    name = form.name or free_name(db, owner_id, service_name(config), keep_id)
    ai_service.write_owner_connection(db, owner_id, config, name=name, profile_id=keep_id)

"""Persistence models owned by AI Providers."""

import time
from typing import Any
from copy import deepcopy
from uuid import uuid4

from sqlalchemy import Boolean, Float, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.repositories.classroom_storage import Base

DEFAULT_BUDGET = {
    "max_calls": 240,
    "max_tokens": 1_000_000,
    "estimated_cost_ceiling": None,
    "fallback_policy": "owner-profile-then-deterministic",
}


class ProviderProfile(Base):  # type: ignore[misc]
    __tablename__ = "provider_profiles"
    __table_args__ = (UniqueConstraint("owner_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    adapter: Mapped[str] = mapped_column(String(32))
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(200), nullable=True)
    project: Mapped[str | None] = mapped_column(String(200), nullable=True)
    default_model: Mapped[str] = mapped_column(String(200))
    credential_mode: Mapped[str] = mapped_column(String(24), default="PERSISTENT")
    encrypted_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    secret_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    key_version: Mapped[str] = mapped_column(String(40), default="v1")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class SessionProviderSecret(Base):  # type: ignore[misc]
    __tablename__ = "session_provider_secrets"

    profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), primary_key=True
    )
    session_token_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("login_sessions.token_hash"), primary_key=True
    )
    encrypted_secret: Mapped[str] = mapped_column(Text)
    secret_last4: Mapped[str] = mapped_column(String(4))
    key_version: Mapped[str] = mapped_column(String(40), default="v1")
    expires_at: Mapped[float] = mapped_column(Float, index=True)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class AccountAISettings(Base):  # type: ignore[misc]
    __tablename__ = "account_ai_settings"

    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), primary_key=True)
    default_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), nullable=True
    )
    fallback_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), nullable=True
    )
    model_matrix: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    budgets: Mapped[dict[str, Any]] = mapped_column(JSON, default=lambda: deepcopy(DEFAULT_BUDGET))
    session_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revision: Mapped[int] = mapped_column(default=1)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)

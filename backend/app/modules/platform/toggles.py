"""後台的功能開關：程式登記清單＋資料庫存值（spec P6、P7、P9、P21、P25）。

A switch is registered here with its name, description and default; the database keeps only the
value an admin set, and who set it when. Every read goes to the database, so a change takes effect
on the next request. The env-only flags in feature_flags.py (ai_students) are separate and stay.
Voice mode is offered only when its switch is on and its key is set (platform config).
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.modules.platform.config import settings
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories import FeatureToggle
from app.modules.platform.storage import transaction


@dataclass(frozen=True)
class ToggleDef:
    name: str
    description: str
    default: bool
    # The error an API answers while the switch is off; None for a switch no API is gated on.
    disabled_reason: str | None = None
    # What the 後台 asks before turning the switch off; None turns it off without asking (P35).
    disable_warning: str | None = None


DB_TOGGLES: dict[str, ToggleDef] = {
    "group_mode": ToggleDef(
        name="多人模式",
        description="分組課（多人教室）。關掉後，分組課的網址和功能都不能使用。",
        default=False,
        disabled_reason="GROUP_MODE_DISABLED",
        disable_warning="關掉後，多人模式的網址和功能都不能使用，正在進行中的也會無法繼續。之後可以再打開。",
    ),
    # 後台 spec P35–P36: courses of a teacher without an AI connection use the 系統 AI.
    "system_ai_fallback": ToggleDef(
        name="老師沒設金鑰時用系統 AI",
        description="沒設 AI 連線的老師，課程裡的學生對話改用系統 AI。",
        default=False,
        disable_warning="關掉後，沒設金鑰的老師，課程裡的學生對話會無法繼續，直到老師自己設好 AI 連線。之後可以再打開。",
    ),
    "voice_mode": ToggleDef(
        name="語音模式",
        description="單人對話可以用說的跟蘇格拉底對話。關掉或沒設語音金鑰時，學生看不到語音入口。",
        default=False,
        disabled_reason="VOICE_MODE_DISABLED",
        disable_warning="關掉後，正在用語音的學生說完當下這句就會切回打字。之後可以再打開。",
    ),
}


def toggle_enabled(db: Session, key: str) -> bool:
    row = db.get(FeatureToggle, key)
    return row.enabled if row is not None else DB_TOGGLES[key].default


def require_toggle(db: Session, key: str) -> None:
    if not toggle_enabled(db, key):
        reason = DB_TOGGLES[key].disabled_reason
        assert reason is not None, f"{key} gates no API"
        raise DomainError(reason, 403)


def set_toggle(db: Session, key: str, enabled: bool, by: str, now: float) -> FeatureToggle:
    if key not in DB_TOGGLES:
        raise KeyError(key)
    row = db.get(FeatureToggle, key)
    if row is None:
        row = FeatureToggle(key=key, enabled=enabled, updated_at=now, updated_by=by)
        db.add(row)
    else:
        row.enabled, row.updated_at, row.updated_by = enabled, now, by
    db.flush()
    return row


def toggle_rows(db: Session) -> list[tuple[str, ToggleDef, FeatureToggle | None]]:
    return [(key, spec, db.get(FeatureToggle, key)) for key, spec in DB_TOGGLES.items()]


def voice_mode_ready(db: Session) -> bool:
    """On, and every key voice mode needs is set."""
    return toggle_enabled(db, "voice_mode") and bool(settings.voice_gemini_api_key.strip())


def features(db: Session) -> dict[str, bool]:
    shown = {key: toggle_enabled(db, key) for key in DB_TOGGLES}
    shown["voice_mode"] = voice_mode_ready(db)
    return shown


def group_mode_required() -> None:
    """FastAPI dependency for every 多人模式 endpoint (spec P8)."""
    with transaction() as db:
        require_toggle(db, "group_mode")


def group_mode_open() -> bool:
    with transaction() as db:
        return toggle_enabled(db, "group_mode")

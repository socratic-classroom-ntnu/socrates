"""後台的功能開關：程式登記清單＋資料庫存值（spec P6、P7、P9、P21、P25）。

A switch is registered here with its name, description and default; the database keeps only the
value an admin set, and who set it when. Every read goes to the database, so a change takes effect
on the next request. The env-only flags in feature_flags.py (ai_students) are separate and stay.
Adding a switch later (voice mode) means one more entry in DB_TOGGLES.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

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
    # 後台「分析紀錄」: side records of every change and every model response, de-identified.
    "interaction_log": ToggleDef(
        name="分析紀錄",
        description="側錄每一個操作和每一次模型回覆，去識別化後存在後台，供之後改進用。",
        default=True,
        disable_warning="關掉後就不再側錄，已經存下的紀錄不受影響。之後可以再打開。",
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


def features(db: Session) -> dict[str, bool]:
    return {key: toggle_enabled(db, key) for key in DB_TOGGLES}


def group_mode_required() -> None:
    """FastAPI dependency for every 多人模式 endpoint (spec P8)."""
    with transaction() as db:
        require_toggle(db, "group_mode")


def group_mode_open() -> bool:
    with transaction() as db:
        return toggle_enabled(db, "group_mode")

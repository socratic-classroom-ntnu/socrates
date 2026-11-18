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
    disabled_reason: str


DB_TOGGLES: dict[str, ToggleDef] = {
    "group_mode": ToggleDef(
        name="多人模式",
        description="分組課（多人教室）。關掉後，分組課的網址和功能都不能使用。",
        default=False,
        disabled_reason="GROUP_MODE_DISABLED",
    ),
}


def toggle_enabled(db: Session, key: str) -> bool:
    row = db.get(FeatureToggle, key)
    return row.enabled if row is not None else DB_TOGGLES[key].default


def require_toggle(db: Session, key: str) -> None:
    if not toggle_enabled(db, key):
        raise DomainError(DB_TOGGLES[key].disabled_reason, 403)


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

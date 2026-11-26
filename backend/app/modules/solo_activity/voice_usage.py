"""Voice mode: each student's voice time per day, counted in Asia/Taipei days.

Time counts while a voice connection is open. The limit is platform config's
``voice_daily_seconds``; at the limit the relay lets the current sentence finish, then hands the
student back to typing with 「今天的語音時間用完了，可以繼續打字」.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.modules.platform.config import settings
from app.modules.solo_activity.repositories import VoiceUsage

TAIPEI = timezone(timedelta(hours=8))
USED_UP = "今天的語音時間用完了，可以繼續打字"


def taipei_day(at: float) -> str:
    return datetime.fromtimestamp(at, TAIPEI).strftime("%Y-%m-%d")


def used(db: Any, account_id: str, at: float) -> float:
    row = db.get(VoiceUsage, (account_id, taipei_day(at)))
    return float(row.seconds) if row is not None else 0.0


def remaining(db: Any, account_id: str, at: float) -> float:
    return max(0.0, settings.voice_daily_seconds - used(db, account_id, at))


def add(db: Any, account_id: str, seconds: float, at: float) -> float:
    """Adds the time to the day it ends on; returns that day's total."""
    if seconds <= 0:
        return used(db, account_id, at)
    day = taipei_day(at)
    row = db.get(VoiceUsage, (account_id, day))
    if row is None:
        row = VoiceUsage(account_id=account_id, day=day, seconds=0.0)
        db.add(row)
    row.seconds = float(row.seconds or 0.0) + seconds
    row.updated_at = time.time()
    db.flush()
    return float(row.seconds)

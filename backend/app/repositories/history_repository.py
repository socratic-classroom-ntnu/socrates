import base64
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, case, or_, select
from sqlalchemy.orm import Session as OrmSession

from app.models import Session, Summary


@dataclass(frozen=True)
class HistoryRow:
    session: Session
    summary: Summary | None


def encode_cursor(rank: int, started_at: datetime, session_id: uuid.UUID) -> str:
    payload = json.dumps(
        {"rank": rank, "started_at": started_at.isoformat(), "id": str(session_id)},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_cursor(value: str) -> tuple[int, datetime, uuid.UUID]:
    padded = value + "=" * (-len(value) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    return (
        int(payload["rank"]),
        datetime.fromisoformat(payload["started_at"]),
        uuid.UUID(payload["id"]),
    )


class HistoryRepository:
    def __init__(self, db: OrmSession) -> None:
        self._db = db

    def list_for_learner(
        self,
        learner_id: uuid.UUID,
        *,
        limit: int,
        cursor: str | None,
    ) -> tuple[list[HistoryRow], str | None]:
        rank = case((Session.status == "active", 0), else_=1)
        stmt = (
            select(Session, Summary)
            .outerjoin(Summary, Summary.session_id == Session.id)
            .where(Session.learner_id == learner_id)
        )
        if cursor:
            cursor_rank, cursor_started, cursor_id = decode_cursor(cursor)
            stmt = stmt.where(
                or_(
                    rank > cursor_rank,
                    and_(rank == cursor_rank, Session.started_at < cursor_started),
                    and_(
                        rank == cursor_rank,
                        Session.started_at == cursor_started,
                        Session.id < cursor_id,
                    ),
                )
            )
        rows = self._db.execute(
            stmt.order_by(rank.asc(), Session.started_at.desc(), Session.id.desc()).limit(limit + 1)
        ).all()
        has_more = len(rows) > limit
        selected = rows[:limit]
        result = [HistoryRow(session=row[0], summary=row[1]) for row in selected]
        next_cursor = None
        if has_more and result:
            tail = result[-1].session
            next_cursor = encode_cursor(
                0 if tail.status == "active" else 1, tail.started_at, tail.id
            )
        return result, next_cursor

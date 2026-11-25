"""後台「分析紀錄」：側錄每一個操作與每一次模型回覆，去識別化後存下來，供之後改進用。

兩個入口，都不會讓原本的請求失敗（寫不進去就算了）：

- ``Middleware``：每一個改變狀態的 API 請求（GET／HEAD／OPTIONS 以外）一筆：路由樣板、路徑參數、
  查詢參數、狀態碼、耗時，以及請求內容。登入、帳號、AI 連線與系統 AI 的請求內容一律不記
  （那裡有密碼和金鑰），其他請求內容裡的密碼、金鑰、帳號名稱、Email、顯示名稱也會先遮掉。
- ``record_model``：每一次經過鐵則的模型呼叫一筆（llm_runtime 呼叫）：程式、模型、送進去的
  context、完整的回覆、鐵則結果與 token 用量；呼叫失敗也記下原因。llm_runtime 經
  ``record_model_later`` 交給一條寫紀錄的執行緒，回覆不等這筆寫完，資料庫慢也不會拖到學生。
  送進去的內容含其他人的話時（例如老師開雷達），呼叫端把那些人列在 ``about``，存成
  ``about_ids``（雜湊）；訪客過期時，提到他的紀錄跟他自己的一起刪。

誰做的只記 ``subject``：帳號 id 以部署金鑰做 HMAC 後的前 24 個字元，同一個人每次都一樣、
但從紀錄回推不到帳號。後台開關「分析紀錄」關掉時兩個入口都不寫。
"""

from __future__ import annotations

import asyncio
import contextvars
import threading
from concurrent.futures import Future, ThreadPoolExecutor, wait
import hashlib
import hmac
import json
import time
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from app.modules.platform.env import env_str

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

TOGGLE = "interaction_log"
MASK = "•••"
# Keys whose values are never kept, at any depth of a request body or model context.
HIDDEN_KEYS = frozenset(
    {
        "password",
        "new_password",
        "current_password",
        "credential",
        "secret",
        "api_key",
        "key",
        "token",
        "csrf_token",
        "username",
        "login",
        "email",
        "display_name",
        "real_name",
        "nickname",
        "teacher_name",
        "alias",
    }
)
# Requests whose bodies are never read: sign-in, the account, AI connections, the 系統 AI.
NO_BODY = (
    "/api/v2/auth",
    "/api/v2/account",
    "/api/v2/provider-profiles",
    "/api/v2/admin/system-ai",
)
QUIET_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
BODY_LIMIT = 64_000
SUBJECT_LENGTH = 24

_subject: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "interaction_subject", default=None
)


KEY_ENV = "INTERACTION_LOG_KEY"
RETENTION_ENV = "INTERACTION_LOG_RETENTION_DAYS"
DEFAULT_RETENTION_DAYS = 30


def _key() -> bytes | None:
    """The deployment's own key; without it nothing is recorded (no key is ever derived)."""
    seed = env_str(KEY_ENV).strip()
    if not seed:
        return None
    return hashlib.sha256(("socrates/interaction-log/v1:" + seed).encode()).digest()


def configured() -> bool:
    """Whether the deployment set INTERACTION_LOG_KEY; without it nothing is recorded."""
    return _key() is not None


def pseudonym(value: str) -> str:
    """The same short value for the same id; the id cannot be read back from it."""
    key = _key()
    if key is None:
        raise RuntimeError(KEY_ENV + " is not set")
    digest = hmac.new(key, value.encode(), hashlib.sha256).hexdigest()
    return digest[:SUBJECT_LENGTH]


def attach(state: Any, account_id: str) -> None:
    """Called once the request's account is known: later records in this request carry it."""
    if _key() is None:
        return
    subject = pseudonym(account_id)
    _subject.set(subject)
    try:
        state.interaction_subject = subject
    except AttributeError:
        pass


def _is_id(key: str) -> bool:
    key = key.lower()
    return key == "id" or key.endswith("_id") or key == "ids" or key.endswith("_ids")


# Database ids are uuids; short ids such as a stance id ("s1") or a message ref are not people.
ID_MIN_LENGTH = 16


def _hashed(value: Any) -> Any:
    if isinstance(value, str) and len(value) >= ID_MIN_LENGTH:
        return pseudonym(value)
    if isinstance(value, list):
        return [_hashed(v) for v in value]
    return value


def _scrubbed(key: str, value: Any) -> Any:
    if key.lower() in HIDDEN_KEYS:
        return MASK
    if _is_id(key):
        return _hashed(value)
    return scrub(value)


def scrub(value: Any) -> Any:
    """A copy with every hidden key's value masked and every database id (under a key named id,
    *_id or *_ids) replaced by its keyed hash, so no record points back at an account, attempt
    or course."""
    if isinstance(value, dict):
        return {k: _scrubbed(str(k), v) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def _plain(value: Any) -> Any:
    """JSON-safe: anything json cannot write becomes its text."""
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def record(
    kind: str,
    name: str,
    outcome: str,
    data: dict[str, Any],
    *,
    subject: str | None = None,
    latency_ms: int | None = None,
) -> None:
    """One record in its own transaction; never raises."""
    from app.modules.platform.repositories import InteractionEvent
    from app.modules.platform.storage import transaction
    from app.modules.platform.toggles import toggle_enabled

    if _key() is None:
        return
    try:
        with transaction() as db:
            if not toggle_enabled(db, TOGGLE):
                return
            db.add(
                InteractionEvent(
                    at=time.time(),
                    kind=kind,
                    name=name[:200],
                    subject=subject if subject is not None else _subject.get(),
                    outcome=outcome[:80],
                    latency_ms=latency_ms,
                    data=_plain(scrub(data)),
                )
            )
    except Exception:  # noqa: BLE001 — a side record never fails the real work
        return


def record_model(
    *,
    kind: str,
    binding: dict[str, Any],
    context: dict[str, Any] | None,
    started: float,
    result: dict[str, Any] | None = None,
    audit: dict[str, Any] | None = None,
    error: BaseException | None = None,
    ended: float | None = None,
    subject: str | None = None,
    about: list[str] | None = None,
) -> None:
    rules = (audit or {}).get("iron_rules") or {}
    if error is not None:
        reason = getattr(error, "reason", None) or getattr(error, "code", None)
        outcome = "error:" + str(reason or type(error).__name__)
    else:
        outcome = str(rules.get("outcome", "pass"))
    record(
        "model",
        kind,
        outcome,
        {
            "provider": binding.get("adapter"),
            "model": (audit or {}).get("actual_model") or binding.get("model"),
            "context": context,
            "result": result,
            "iron_rules": rules or None,
            "token_usage": (audit or {}).get("token_usage"),
            # The people whose words were sent, as their keyed hash (scrub hashes *_ids).
            "about_ids": list(about) if about else None,
        },
        subject=subject,
        latency_ms=round(((time.monotonic() if ended is None else ended) - started) * 1000),
    )


# One writer thread: a model call hands its record over and returns at once, so the write never
# counts toward the caller's timeout or makes a student wait for the database.
_writer = ThreadPoolExecutor(max_workers=1, thread_name_prefix="interaction-log")
_pending: set[Future[None]] = set()
_pending_lock = threading.Lock()


def _done(future: Future[None]) -> None:
    with _pending_lock:
        _pending.discard(future)


def record_model_later(**fields: Any) -> None:
    """``record_model`` on the writer thread. The subject and the time the call ended are taken
    now, in the caller's request, not when the write happens."""
    if _key() is None:
        return
    fields.setdefault("subject", _subject.get())
    fields.setdefault("ended", time.monotonic())
    future = _writer.submit(record_model, **fields)
    with _pending_lock:
        _pending.add(future)
    future.add_done_callback(_done)


def flush(timeout: float = 10.0) -> None:
    """Wait for the records already handed to the writer thread (tests read right after)."""
    with _pending_lock:
        pending = list(_pending)
    wait(pending, timeout=timeout)


class Middleware:
    """Pure ASGI, so the body is read as it streams past and the route sees it untouched."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        method = scope.get("method", "")
        path = str(scope.get("path", ""))
        if (
            scope.get("type") != "http"
            or method in QUIET_METHODS
            or not path.startswith("/api/v2/")
        ):
            await self.app(scope, receive, send)
            return
        keep_body = not path.startswith(NO_BODY)
        body = bytearray()
        status = {"code": 500}
        started = time.monotonic()
        token = _subject.set(None)

        async def tee() -> Message:
            message = await receive()
            if keep_body and message.get("type") == "http.request" and len(body) < BODY_LIMIT:
                body.extend(message.get("body", b"")[: BODY_LIMIT - len(body)])
            return message

        async def watch(message: Message) -> None:
            if message.get("type") == "http.response.start":
                status["code"] = int(message.get("status", 500))
            await send(message)

        try:
            await self.app(scope, tee, watch)
        finally:
            route = scope.get("route")
            template = getattr(route, "path", None) or path
            state = scope.get("state") or {}
            subject = state.get("interaction_subject") if isinstance(state, dict) else None
            await asyncio.to_thread(
                record,
                "request",
                f"{method} {template}",
                str(status["code"]),
                {
                    "path_params": scope.get("path_params") or {},
                    "query": _query(scope),
                    "body": _body(bytes(body)) if keep_body else None,
                },
                subject=subject or _subject.get(),
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            _subject.reset(token)


def _query(scope: Scope) -> dict[str, str]:
    from urllib.parse import parse_qsl

    raw = scope.get("query_string", b"")
    return dict(parse_qsl(raw.decode("latin-1") if isinstance(raw, bytes) else str(raw)))


def _body(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return {"bytes": len(raw)}


def retention_days() -> int:
    raw = env_str(RETENTION_ENV).strip()
    try:
        days = int(raw) if raw else DEFAULT_RETENTION_DAYS
    except ValueError:
        days = DEFAULT_RETENTION_DAYS
    return max(1, days)


def purge(now: float | None = None) -> int:
    """Delete records older than the retention (INTERACTION_LOG_RETENTION_DAYS, default 30)."""
    from sqlalchemy import delete

    from app.modules.platform.repositories import InteractionEvent
    from app.modules.platform.storage import transaction

    cutoff = (time.time() if now is None else now) - retention_days() * 86400
    with transaction() as db:
        result = db.execute(delete(InteractionEvent).where(InteractionEvent.at < cutoff))
        return int(getattr(result, "rowcount", 0) or 0)


class GuestRecords:
    """The guest hook (identity-access GuestRecordHook), wired by the app shell: a guest's records
    follow them into the account they log in to, and are deleted when the guest expires."""

    def reassign(self, db: Any, guest_id: str, account_id: str) -> None:
        from sqlalchemy import update

        from app.modules.platform.repositories import InteractionEvent

        if _key() is None:
            return
        db.execute(
            update(InteractionEvent)
            .where(InteractionEvent.subject == pseudonym(guest_id))
            .values(subject=pseudonym(account_id))
        )

    def forget_name(self, db: Any, guest_id: str) -> None:
        from sqlalchemy import Text, cast, delete, or_

        from app.modules.platform.repositories import InteractionEvent

        if _key() is None:
            return
        flush()
        mine = pseudonym(guest_id)
        # Their own records, and any record whose sent words were theirs (about_ids), such as a
        # teacher's radar run over the class. The hash is 24 hex characters, so matching it in
        # the record's text finds only records that carry it.
        db.execute(
            delete(InteractionEvent).where(
                or_(
                    InteractionEvent.subject == mine,
                    cast(InteractionEvent.data, Text).like(f"%{mine}%"),
                )
            )
        )


GUEST_HOOK = GuestRecords()

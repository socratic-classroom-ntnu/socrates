"""我的用量: what the teacher's own key has used, asked from the service (需求〈我的用量〉).

Only OpenRouter can be asked (`GET /api/v1/key` with the teacher's key); the call runs outside
any database transaction. A failure is an answer of its own, never an error: the page says the
usage could not be read and the connection is unchanged.
"""

import asyncio
import logging
from typing import Literal

from app.modules.ai_connection import service as checks
from app.modules.ai_connection.contracts import AIConnectionUsageView
from app.modules.ai_providers import service as ai_service

logger = logging.getLogger(__name__)

RESETS = ("daily", "weekly", "monthly")


Status = Literal["ok", "unsupported", "failed", "none"]


def answer(status: Status, adapter: str | None = None, **numbers) -> AIConnectionUsageView:
    return AIConnectionUsageView(
        status=status,
        adapter=adapter,
        used=numbers.get("used"),
        limit=numbers.get("limit"),
        remaining=numbers.get("remaining"),
        limit_reset=numbers.get("limit_reset"),
    )


NONE = answer("none")


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def read_key_info(body) -> AIConnectionUsageView:
    """OpenRouter's /key answer → the page's numbers; anything unreadable is a failure."""
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        return answer("failed", "openrouter")
    reset = data.get("limit_reset")
    limit_reset = reset if reset in RESETS else None
    if data.get("limit") is not None:
        limit = _number(data.get("limit"))
        remaining = _number(data.get("limit_remaining"))
        if limit is None or remaining is None:
            return answer("failed", "openrouter")
        return answer(
            "ok",
            "openrouter",
            used=limit - remaining,
            limit=limit,
            remaining=remaining,
            limit_reset=limit_reset,
        )
    used = _number(data.get("usage"))
    if used is None:
        return answer("failed", "openrouter")
    return answer("ok", "openrouter", used=used)


async def ask(config: ai_service.PlatformConfig | None, owner_id: str) -> AIConnectionUsageView:
    """`config`: the teacher's connection in use with its key, or None (no usage to show)."""
    if config is None:
        return NONE
    if config.adapter != "openrouter":
        return answer("unsupported", config.adapter)
    try:
        async with asyncio.timeout(checks.PROBE_SECONDS):
            body = await ai_service.openrouter_key_info(ai_service.probe_binding(config, owner_id))
    except Exception as failure:  # noqa: BLE001 — every failure is the same answer
        # The kind only: an error's text may carry the request, and the request the key.
        logger.warning("查不到老師的用量（%s）", type(failure).__name__)
        return answer("failed", "openrouter")
    return read_key_info(body)

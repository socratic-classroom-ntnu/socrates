"""前後端接縫的檢查：錯誤碼目錄、前端文案、尚未帶 response_model 的端點清單。"""

import re
from pathlib import Path

from app.modules.contract.contracts import (
    DYNAMIC_REASON_CODES,
    REASON_CODES,
    RESPONSE_MODEL_PENDING,
    SERVER_ONLY_REASON_CODES,
)
from app.modules.contract.service import (
    classroom_app,
    raised_reason_codes,
    routes_without_response_model,
)

ERROR_TEXT = Path(__file__).resolve().parents[3] / "frontend/src/contract/errorText.ts"


def frontend_codes() -> set[str]:
    return set(re.findall(r"^\s+([A-Z0-9_]+):", ERROR_TEXT.read_text(encoding="utf-8"), re.M))


def test_every_raised_reason_code_is_catalogued_with_its_modules():
    raised = {code: tuple(sorted(modules)) for code, modules in raised_reason_codes().items()}
    assert raised == REASON_CODES


def test_every_user_facing_code_has_frontend_text_and_no_text_is_stale():
    texts = frontend_codes()
    user_facing = (set(REASON_CODES) | set(DYNAMIC_REASON_CODES)) - set(SERVER_ONLY_REASON_CODES)
    assert user_facing <= texts, sorted(user_facing - texts)
    stale = {code for code in texts - user_facing if not code.isdigit()}
    assert not stale, sorted(stale)


def test_endpoints_without_response_model_only_shrink():
    missing = set(routes_without_response_model(classroom_app()))
    assert missing <= set(RESPONSE_MODEL_PENDING), sorted(missing - set(RESPONSE_MODEL_PENDING))
    assert set(RESPONSE_MODEL_PENDING) <= missing, sorted(set(RESPONSE_MODEL_PENDING) - missing)

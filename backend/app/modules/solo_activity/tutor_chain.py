"""Which connection a teacher's course uses (後台 spec P36).

The teacher's own default/fallback first. Only when that leaves nothing usable — none set,
disabled, keyless, or a login-session key that is gone — and the 後台 switch
`system_ai_fallback` is on, the 系統 AI takes over, with its own model. A teacher's key that
fails on the call is not replaced: that error stays the teacher's to fix. Group classes resolve
their own chain and never hand over.
"""

from sqlalchemy.orm import Session

from app.modules.ai_providers.service import platform_binding, resolve_owner_chain
from app.modules.course_management import service as course_service
from app.modules.platform.errors import DomainError
from app.modules.platform.toggles import toggle_enabled


def course_bindings(db: Session, course, role: str) -> list[dict]:
    try:
        bindings, _ = resolve_owner_chain(db, course.owner_id, role)
    except DomainError as error:
        # 我的對話 runs on the 系統 AI; a key of it that no longer decrypts counts as no connection
        # (後台 spec P30). A teacher's own broken key stays an error for them to fix (P36).
        if error.code != "PROVIDER_CREDENTIAL_DECRYPTION" or (
            course.owner_id != course_service.practice_owner(db).id
        ):
            raise
        return []
    if bindings or not toggle_enabled(db, "system_ai_fallback"):
        return bindings
    system = platform_binding(db, course_service.practice_owner(db).id, role)
    return [system] if system is not None else []

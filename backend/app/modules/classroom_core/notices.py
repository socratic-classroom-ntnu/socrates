"""Stable classroom-visible notices."""

_BUDGET_REASONS = frozenset(
    {
        "CLASSROOM_BUDGET_AVAILABILITY",
        "CLASSROOM_CALL_BUDGET_AVAILABILITY",
        "CLASSROOM_TOKEN_BUDGET_AVAILABILITY",
        "CLASSROOM_COST_BUDGET_AVAILABILITY",
        "GLOBAL_BUDGET_AVAILABILITY",
    }
)


def tutor_unavailable_notice(reason: str) -> str:
    """Classroom-visible reason for a paused tutor; the teacher's 下一步 resumes the class."""
    if reason in _BUDGET_REASONS:
        return "導師暫停回應：本教室的 LLM 額度已達上限。老師可調整額度後按「下一步」繼續。"
    if reason == "OWNER_PROVIDER_PROFILE_REQUIRED":
        return "導師暫停回應：教室擁有者尚未設定 LLM。老師可設定後按「下一步」繼續。"
    return "導師暫停回應：LLM 暫時無法連線。老師可按「下一步」繼續。"

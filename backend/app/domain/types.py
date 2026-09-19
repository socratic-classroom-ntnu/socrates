from typing import Literal

Action = Literal["send_message", "advance", "end", "retry"]
FlowState = Literal["active_in_stage", "at_crossroad", "awaiting_wrap_up", "ended"]
SessionStatus = Literal["active", "ended"]
StageStatus = Literal[
    "not_started", "in_progress", "goal_met", "capped", "stopped_early", "skipped"
]
PrincipleLabel = Literal["後果主義", "義務論", "混合", "未明"]
MessageRole = Literal["student", "tutor", "system"]
EndReason = Literal["student_ended", "completed", "restarted"]

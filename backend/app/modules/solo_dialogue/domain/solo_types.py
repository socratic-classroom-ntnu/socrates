"""Names shared by the solo-activity state machine and its API contract.

The Literals list every state and action in the design spec's §4.5 table; states and actions
not implemented yet are part of the type but never produced.
"""

from typing import Literal

SoloState = Literal[
    "choosing_stance",
    "awaiting_tutor",
    "tutor_unavailable",
    "in_dialogue",
    "confirming",
    "between_questions",
    "reviewing",
    "awaiting_reflection_prompt",
    "reflecting",
    "budget_exhausted",
    "completed",
]
SoloAction = Literal[
    "submit_stance",
    "send_message",
    "retry",
    "confirm_viewpoint",
    "revise_viewpoint",
    "next_question",
    "submit_review",
    "retry_reflection_prompt",
    "continue_reflection",
    "submit_reflection",
    "continue_without_tutor",
]
SoloNotice = Literal["tutor_unavailable", "owner_provider_missing"]
QuestionStatus = Literal["in_progress", "goal_met"]
PrincipleHint = Literal["後果主義", "義務論", "混合"]

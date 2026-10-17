"""Compatibility exports for the shared LLM Runtime advance policy."""

from app.modules.llm_runtime.policy import stage_goal_met as stage_goal_met
from app.modules.llm_runtime.policy import should_advance as should_advance

__all__ = ["stage_goal_met", "should_advance"]

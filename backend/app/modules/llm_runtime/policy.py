"""Shared evidence-to-advance policy for tutor-driven dialogue."""

from app.modules.llm_runtime.contracts import Observations


def stage_goal_met(obs: Observations) -> bool:
    return obs.has_position and obs.has_reason and obs.reason_tested


def should_advance(obs: Observations, turn_count: int) -> bool:
    if turn_count < 1:
        return False
    if obs.position_shifted:
        return False
    return stage_goal_met(obs)

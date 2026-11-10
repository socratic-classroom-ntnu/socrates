"""Public entry point of the llm_runtime module."""

from app.modules.llm_runtime.contracts import Observations

# Public surface for other modules (they import from service, not from these files).
from app.modules.llm_runtime.iron_rules import (  # noqa: E402
    check as check,
    fallback_text as fallback_text,
    guarded_generate as guarded_generate,
    screen_input as screen_input,
)
from app.modules.llm_runtime.prompts import (  # noqa: E402
    compile_program as compile_program,
)


def should_advance(
    observations: "Observations",
    turn_count: int,
    turns_since_shift: int | None = None,
    turns_since_revise: int | None = None,
) -> bool:
    """The advance criteria (single source: llm_runtime/policy.py), looked up at call time."""
    from app.modules.llm_runtime import policy

    return policy.should_advance(
        observations,
        turn_count,
        turns_since_shift=turns_since_shift,
        turns_since_revise=turns_since_revise,
    )


def should_conclude(confirmed_scenarios: int, shifted_in_latest: bool) -> bool:
    """Whether the scenario sequence ends (single source: llm_runtime/policy.py)."""
    from app.modules.llm_runtime import policy

    return policy.should_conclude(confirmed_scenarios, shifted_in_latest)

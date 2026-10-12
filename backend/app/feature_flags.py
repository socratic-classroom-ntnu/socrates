"""Backend-owned product feature flags with stable reason codes."""

from dataclasses import dataclass

from app.classroom_env import env_bool


@dataclass(frozen=True)
class FeatureFlag:
    env: str
    default: bool
    disabled_reason: str


FEATURES = {
    # Additional product features register here and inherit the same public shape.
    "ai_students": FeatureFlag(
        env="SOCRATES_FEATURE_AI_STUDENTS",
        default=True,
        disabled_reason="AI_STUDENTS_DISABLED",
    ),
}


def feature_enabled(name: str) -> bool:
    flag = FEATURES[name]
    return env_bool(flag.env, flag.default)


def feature_state(name: str) -> dict:
    flag = FEATURES[name]
    enabled = feature_enabled(name)
    return {
        "enabled": enabled,
        "reason": None if enabled else flag.disabled_reason,
    }


def feature_states(*names: str) -> dict:
    selected = names or tuple(FEATURES)
    return {name: feature_state(name) for name in selected}


def require_feature(name: str) -> None:
    if feature_enabled(name):
        return
    from app.orchestrator.classroom import DomainError

    raise DomainError(FEATURES[name].disabled_reason, 409)

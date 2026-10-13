"""Public application surface for AI Providers.

The route module remains a compatibility implementation while the provider use cases
move here in later source metabolism; callers depend only on this module.
"""

from importlib import import_module
from typing import Any, cast

from app.modules.ai_providers.repositories import AccountAISettings as AccountAISettings


def _impl() -> Any:
    return import_module("app.api.routes.provider_profiles")


def account_settings_view(value: Any) -> dict[str, Any]:
    return cast(dict[str, Any], _impl()._settings_view(value))


def classroom_settings_view(value: dict[str, Any] | None) -> dict[str, Any]:
    return cast(dict[str, Any], _impl()._classroom_settings_view(value))


def resolve_request_chain(*args: Any, **kwargs: Any) -> Any:
    return _impl().resolve_request_chain(*args, **kwargs)


def record_direct_call_audit(*args: Any, **kwargs: Any) -> Any:
    return _impl().record_direct_call_audit(*args, **kwargs)


def public_binding(value: dict[str, Any]) -> dict[str, Any]:
    return cast(dict[str, Any], _impl().public_binding(value))


def provider_error_status(reason: str) -> int:
    return cast(int, _impl().provider_error_status(reason))

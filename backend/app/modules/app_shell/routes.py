"""Central FastAPI router composition; route modules never include one another."""

from importlib import import_module
from typing import Any

from fastapi import FastAPI

_ROUTE_MODULES = (
    "app.api.routes.classroom",
    "app.api.routes.groups",
    "app.api.routes.classroom_library",
    "app.api.routes.public_config",
    "app.api.routes.ai_students",
    "app.api.routes.provider_profiles",
    "app.api.routes.question_bank",
    "app.api.routes.script_assist",
)


def _router(module_name: str) -> Any:
    return getattr(import_module(module_name), "router")


def include_classroom_routers(app: FastAPI) -> None:
    app.include_router(_router(_ROUTE_MODULES[0]))
    for module_name in _ROUTE_MODULES[1:]:
        app.include_router(_router(module_name), prefix="/api/v2")

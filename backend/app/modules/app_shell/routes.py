"""Central FastAPI router composition; route modules never include one another."""

from fastapi import FastAPI

from app.modules.ai_providers import routes as ai_providers
from app.modules.analytics import routes as analytics
from app.modules.classroom_core import library_routes as classroom_library
from app.modules.classroom_core import routes as classroom
from app.modules.content_authoring.routes import question_bank, script_assist, scripts
from app.modules.group_dialogue.routes import ai_students, groups
from app.modules.identity_access import routes as identity
from app.modules.platform import routes as platform

# Mounted under /api/v2, in this order (FastAPI matches the first route that fits).
CLASSROOM_ROUTERS = (
    identity.router,
    scripts.router,
    groups.router,
    analytics.router,
    classroom_library.router,
    platform.router,
    ai_students.router,
    ai_providers.router,
    question_bank.router,
    script_assist.router,
)


def include_classroom_routers(app: FastAPI) -> None:
    app.include_router(classroom.router)  # carries its own /api/v2 prefix
    for router in CLASSROOM_ROUTERS:
        app.include_router(router, prefix="/api/v2")

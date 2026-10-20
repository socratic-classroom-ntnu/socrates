"""Application composition. Legacy Round1 routers remain available alongside /api/v2."""

import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.modules.course_management.api.routes.activities import router as activities_router
from app.modules.course_management.api.routes.courses import preview_router as course_join_router
from app.modules.course_management.api.routes.courses import router as courses_router
from app.modules.llm_runtime.tutor import prompts
from app.modules.classroom_core.api.routes.classroom import router
from app.modules.classroom_core.api.routes.question_bank import router as question_bank_router
from app.modules.classroom_core.api.routes.script_assist import router as script_assist_router
from app.modules.classroom_core.orchestrator.classroom import DomainError
from app.modules.platform.realtime import BUS
from app.modules.solo_dialogue.api.routes.solo_attempts import router as solo_router
from app.modules.solo_dialogue.api.routes.solo_progress import router as solo_progress_router
from app.modules.platform.repositories.classroom_storage import engine
from app.modules.llm_runtime.services.llm_workers import clock_loop, llm_loop, mail_loop
from app.modules.platform.classroom_env import env_int


@asynccontextmanager
async def lifespan(app):
    engine()
    worker_count = max(1, env_int("CLASSROOM_LLM_WORKERS", 4))
    loops = [BUS.listen, BUS.sweep, clock_loop, mail_loop] + [llm_loop] * worker_count
    tasks = [asyncio.create_task(fn()) for fn in loops]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError):
                await task


def create_app(legacy=False, background=True):
    prompts.validate_programs()
    app = FastAPI(title="Socrates API", version="0.3.0", lifespan=lifespan if background else None)
    if legacy:
        from app.main import app as first_run

        app.router.routes.extend(first_run.router.routes)
    app.include_router(router)
    app.include_router(question_bank_router, prefix="/api/v2")
    app.include_router(script_assist_router, prefix="/api/v2")
    app.include_router(courses_router, prefix="/api/v2")
    app.include_router(course_join_router, prefix="/api/v2")
    app.include_router(activities_router, prefix="/api/v2")
    app.include_router(solo_router, prefix="/api/v2")
    app.include_router(solo_progress_router, prefix="/api/v2")

    @app.get("/api/v2/readiness")
    def readiness():
        from sqlalchemy import text

        with engine().connect() as c:
            c.execute(text("SELECT 1"))
            c.execute(text("SELECT 1 FROM accounts LIMIT 1"))
        return {"status": "ready", "database": "connected", "runtime": "classroom"}

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, exc: DomainError):
        return JSONResponse({"detail": exc.code}, status_code=exc.status)

    @app.middleware("http")
    async def security_headers(request, call_next):
        try:
            size = int(request.headers.get("content-length", "0") or 0)
        except ValueError:
            return JSONResponse({"detail": "CONTENT_LENGTH"}, status_code=400)
        if size > 1_100_000:
            return JSONResponse({"detail": "REQUEST_SIZE"}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    return app

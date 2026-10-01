"""Application composition. Legacy Round1 routers remain available alongside /api/v2."""

import asyncio
import os
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .api import router
from .orchestrator import DomainError
from .realtime import BUS
from .storage import engine
from .workers import clock_loop, llm_loop, mail_loop


@asynccontextmanager
async def lifespan(app):
    engine()
    from .provider_profiles import migrate_provider_credentials

    app.state.provider_key_migration = migrate_provider_credentials()
    worker_count = max(1, int(os.environ.get("RUN2_LLM_WORKERS", "4")))
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
    app = FastAPI(title="Socrates API", version="0.3.0", lifespan=lifespan if background else None)
    if legacy:
        from app.main import app as first_run

        app.router.routes.extend(first_run.router.routes)
    app.include_router(router)

    @app.get("/api/v2/readiness")
    def readiness():
        from sqlalchemy import text

        with engine().connect() as c:
            c.execute(text("SELECT 1"))
            c.execute(text("SELECT 1 FROM r2_accounts LIMIT 1"))
        return {
            "status": "ready",
            "database": "connected",
            "runtime": "classroom-run2",
            "provider_key_migration": getattr(
                app.state,
                "provider_key_migration",
                {"state": "BACKGROUND_DISABLED"},
            ),
        }

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

"""Application composition: /api/v2, plus /api/health and /api/release from app/main.py."""

import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.modules.llm_runtime import prompts
from app.modules.course_management import service as course_service
from app.modules.ai_providers import service as ai_service
from app.modules.app_shell import practice_startup
from app.modules.app_shell import models as _models  # noqa: F401  註冊所有模組的 ORM
from app.modules.app_shell import wiring as _wiring  # noqa: F401  接上跨模組的 hook
from app.modules.app_shell.contracts import ReadinessView
from app.modules.app_shell.routes import include_classroom_routers
from app.modules.platform.errors import DomainError
from app.modules.classroom_core.realtime import BUS
from app.modules.platform.storage import engine, transaction
from app.modules.app_shell.llm_workers import (
    clock_loop,
    feedback_purge_loop,
    guest_expiry_loop,
    llm_loop,
    mail_loop,
)
from app.modules.platform.env import env_int


@asynccontextmanager
async def lifespan(app):
    engine()
    with transaction() as db:
        practice_startup.prepare_practice(db, app.state.practice_config)
    worker_count = max(1, env_int("CLASSROOM_LLM_WORKERS", 4))
    loops = [BUS.listen, BUS.sweep, clock_loop, mail_loop, guest_expiry_loop, feedback_purge_loop]
    loops += [llm_loop] * worker_count
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
    _wiring.check_guest_hooks()
    _wiring.check_enrollment_hooks()
    # 題庫壞掉就讓服務起不來，跟 programs 一樣在部署當下發現
    course_service.install_practice_bank(course_service.PRACTICE_BANK_PATH)
    course_service.check_practice_settings()
    # 平台金鑰設定錯誤同樣讓服務起不來；寫進資料庫的部分在 lifespan（practice_startup）
    practice_config = ai_service.platform_profile_config()
    app = FastAPI(
        title="Socrates API",
        version="0.3.0",
        lifespan=lifespan if background else None,
        separate_input_output_schemas=False,
    )
    app.state.practice_config = practice_config
    if legacy:
        from app.main import app as first_run

        app.router.routes.extend(first_run.router.routes)
    include_classroom_routers(app)

    @app.get("/api/v2/readiness", response_model=ReadinessView)
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

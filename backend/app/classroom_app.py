"""Application composition: /api/v2, plus /api/health and /api/release from app/main.py."""

import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.modules.llm_runtime import prompts
from app.modules.course_management import service as course_service
from app.modules.ai_providers import service as ai_service
from app.modules.admin import service as admin_service
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

# Forms that carry an API key: their 422s never quote the request body (後台 spec P37).
SYSTEM_AI_PATH = "/api/v2/admin/system-ai"
AI_CONNECTION_PATH = "/api/v2/ai-settings/connection"
KEY_FORM_PATHS = (SYSTEM_AI_PATH, AI_CONNECTION_PATH)


@asynccontextmanager
async def lifespan(app):
    engine()
    # 系統 AI：資料庫沒有可用的連線才讀 env（後台 spec P30）；env 不合法時服務起不來
    practice_startup.prepare_practice(ai_service.platform_profile_config)
    with transaction() as db:
        admin_service.bootstrap_from_env(db)  # 第一批平台管理員（後台 spec P3）
        # 放在環境變數之後：先建內建管理員的話，資料庫就不再是「沒有管理員」，環境變數永遠不會套用
        admin_service.ensure_builtin_admin(db)
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
    _wiring.check_account_hooks()
    # 題庫壞掉就讓服務起不來，跟 programs 一樣在部署當下發現
    course_service.install_practice_bank(course_service.PRACTICE_BANK_PATH)
    course_service.check_practice_settings()
    app = FastAPI(
        title="Socrates API",
        version="0.3.0",
        lifespan=lifespan if background else None,
        separate_input_output_schemas=False,
    )
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

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        """FastAPI's 422 quotes what was sent; on a form with an API key (系統 AI, AI 連線設定)
        that may be the key, so those errors leave out `input` and `ctx` (後台 spec P37).
        Nothing here logs `exc`."""
        if not request.url.path.startswith(KEY_FORM_PATHS):
            return await request_validation_exception_handler(request, exc)
        errors = [
            {key: value for key, value in error.items() if key not in ("input", "ctx")}
            for error in exc.errors()
        ]
        return JSONResponse({"detail": jsonable_encoder(errors)}, status_code=422)

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

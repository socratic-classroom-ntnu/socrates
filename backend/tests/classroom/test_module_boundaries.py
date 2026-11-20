import ast
import subprocess
import sys

PROVIDER_MODULES = (
    "app.modules.ai_providers.classroom_provider",
    "app.modules.ai_providers.classroom_gateway",
    "app.modules.ai_providers.routes",
)


def run(code: str) -> str:
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def test_classroom_orchestrator_imports_no_provider_module():
    code = (
        "import sys, app.modules.classroom_core.orchestrator; "
        f"print([m for m in {PROVIDER_MODULES!r} if m in sys.modules])"
    )
    assert run(code) == "[]"


def test_platform_storage_loads_no_business_module():
    code = (
        "import sys, app.modules.platform.storage; "
        "print(sorted(m for m in sys.modules if m.startswith('app.modules.') and not m.startswith('app.modules.platform')))"
    )
    assert run(code) == "[]"


def test_fresh_sqlite_schema_from_the_app_shell_model_registry_has_every_table():
    code = (
        "from sqlalchemy import inspect; from app.modules.platform import storage as storage; "
        "import app.modules.app_shell.models; "
        "e = storage.configure('sqlite+pysqlite:///:memory:', create=True); "
        "print(sorted(inspect(e).get_table_names()))"
    )
    tables = set(ast.literal_eval(run(code)))
    expected = {
        "provider_profiles",
        "session_provider_secrets",
        "account_ai_settings",
        "ai_students",
        "accounts",
        "classroom_runs",
        "llm_jobs",
        "classroom_assets",
        "classroom_sessions",
        "library_receipts",
        "mail_delivery",
    }
    assert expected <= tables

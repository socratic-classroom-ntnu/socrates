import ast
import subprocess
import sys

PROVIDER_MODULES = ("app.run2.provider", "app.run2.provider_gateway", "app.run2.provider_profiles")


def run(code: str) -> str:
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def test_run2_orchestrator_imports_no_provider_module():
    code = (
        "import sys, app.run2.orchestrator; "
        f"print([m for m in {PROVIDER_MODULES!r} if m in sys.modules])"
    )
    assert run(code) == "[]"


def test_fresh_sqlite_schema_from_storage_alone_has_every_table():
    code = (
        "from sqlalchemy import inspect; from app.run2 import storage; "
        "e = storage.configure('sqlite+pysqlite:///:memory:', create=True); "
        "print(sorted(inspect(e).get_table_names()))"
    )
    tables = set(ast.literal_eval(run(code)))
    expected = {
        "r97_provider_profiles",
        "r97_session_provider_secrets",
        "r97_account_ai_settings",
        "r88_ai_students",
        "r73_classroom_assets",
        "r73_classroom_sessions",
        "r73_library_receipts",
        "r104_mail_delivery",
    }
    assert expected <= tables

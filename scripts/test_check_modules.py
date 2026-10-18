"""scripts/check_modules.py 的解析規則（#55 審查：改用 ast）。從 repo 根目錄執行：
`python -m pytest scripts/test_check_modules.py -q`
"""

import ast
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("check_modules", Path(__file__).with_name("check_modules.py"))
assert spec and spec.loader
check_modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_modules)


def modules(path: str, source: str) -> list[str]:
    return check_modules.imported_modules(path, ast.parse(source))


def test_adjacent_from_imports_are_both_read():
    found = modules("backend/app/x/y.py", "from app.a import b\nfrom app.c import (\n    d,\n)\n")
    assert {"app.a.b", "app.c.d"} <= set(found)


def test_relative_imports_resolve_from_file_location():
    assert "app.services.classroom_auth" in modules("backend/app/api/deps.py", "from ..services import classroom_auth\n")
    assert "app.api.schemas" in modules("backend/app/api/deps.py", "from .schemas import X\n")
    assert "app.x.helpers" in modules("backend/app/x/__init__.py", "from .helpers import h\n")


def test_imports_inside_docstrings_are_ignored():
    assert modules("backend/app/x/y.py", '"""範例：\nfrom app.a import b\n"""\n') == []


def test_annotated_tablename_counts_as_orm():
    tree = ast.parse("class T(Base):\n    __tablename__: ClassVar[str] = 't'\n")
    assert check_modules.defines_table(tree)
    assert not check_modules.defines_table(ast.parse("NAME = '__tablename__'\n"))


def test_violation_kind_ignores_paths():
    moved = "identity_access→classroom_core  backend/app/modules/identity_access/x.py → backend/app/orchestrator/classroom.py"
    before = "identity_access→classroom_core  backend/app/services/x.py → backend/app/orchestrator/classroom.py"
    assert check_modules.kind(moved) == check_modules.kind(before) == "identity_access→classroom_core"

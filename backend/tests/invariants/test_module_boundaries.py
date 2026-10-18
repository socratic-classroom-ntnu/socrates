import ast
import pathlib

# 兩個狀態機：單人對話（solo）與課堂（classroom）。搬家時改這裡，空目錄會讓測試失敗而不是空轉。
ORCHESTRATOR_DIRS = ("modules/solo_dialogue/orchestrator", "modules/classroom_core/orchestrator")
FORBIDDEN = ("app.modules.llm_runtime.tutor.provider", "app.modules.llm_runtime.tutor.scripted")


def test_orchestrator_does_not_import_llm_modules():
    """設計規格 §5.1：Orchestrator 不知道 LLM 存在。

    這條分界線是「腳本驗收」與「真 API」能共用同一套流程的原因。
    Orchestrator 只能認識 TutorGateway 這個介面，不能認識任何 provider。
    """
    app = pathlib.Path(__file__).parents[2] / "app"
    files: list[pathlib.Path] = []
    for directory in ORCHESTRATOR_DIRS:
        found = sorted((app / directory).rglob("*.py"))
        assert any(
            p.name != "__init__.py" for p in found
        ), f"{directory} 裡沒有狀態機原始碼，掃描範圍要跟著搬家"
        files += found
    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module] + [f"{node.module}.{alias.name}" for alias in node.names]
            for name in names:
                assert not any(
                    name.startswith(f) for f in FORBIDDEN
                ), f"{path.name} 不得 import {name}"

import ast
import pathlib

FORBIDDEN = ("app.tutor.provider", "app.tutor.scripted")


def test_orchestrator_does_not_import_llm_modules():
    """設計規格 §5.1：Orchestrator 不知道 LLM 存在。

    這條分界線是「腳本驗收」與「真 API」能共用同一套流程的原因。
    Orchestrator 只能認識 TutorGateway 這個介面，不能認識任何 provider。
    """
    root = pathlib.Path(__file__).parents[2] / "app" / "orchestrator"
    for path in root.rglob("*.py"):
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

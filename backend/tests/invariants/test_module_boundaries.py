import ast
import pathlib

# 兩個狀態機與推進判準（單人對話、課堂）。搬家時改這裡；找不到檔案會直接失敗，不會空轉。
STATE_MACHINE_FILES = (
    "solo_dialogue/orchestrator.py",
    "classroom_core/orchestrator.py",
    "classroom_core/policy.py",
    "llm_runtime/policy.py",
)
FORBIDDEN = ("app.modules.solo_dialogue.tutor_provider", "app.modules.solo_dialogue.scripted")


def test_orchestrator_does_not_import_llm_modules():
    """設計規格 §5.1：Orchestrator 不知道 LLM 存在。

    這條分界線是「腳本驗收」與「真 API」能共用同一套流程的原因。
    Orchestrator 只能認識 TutorGateway 這個介面，不能認識任何 provider。
    """
    modules = pathlib.Path(__file__).parents[2] / "app" / "modules"
    files = [modules / f for f in STATE_MACHINE_FILES]
    missing = [str(f) for f in files if not f.is_file()]
    assert not missing, f"狀態機檔案搬家了，請更新 STATE_MACHINE_FILES：{missing}"
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

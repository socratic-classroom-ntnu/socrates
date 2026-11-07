"""兩段 mypy：核心照 pyproject 的 strict，課堂模組照 mypy-classroom.ini。

課堂模組清單只寫在 mypy-classroom.ini 的 section 標頭一處；CI 與 pre-push 都跑這支，
搬檔或改名時只要改那一行。從 backend/ 執行：`python tools/mypy_check.py`。
"""

import configparser
import re
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def relaxed_files() -> list[str]:
    ini = configparser.ConfigParser()
    ini.read(BACKEND / "mypy-classroom.ini", encoding="utf-8")
    modules: list[str] = []
    for section in ini.sections():
        if section.startswith("mypy-"):
            modules += section[len("mypy-") :].split(",")
    files = []
    for module in modules:
        path = BACKEND / (module.replace(".", "/") + ".py")
        if not path.exists():
            raise SystemExit(f"mypy-classroom.ini 列了不存在的模組：{module}")
        files.append(path.relative_to(BACKEND).as_posix())
    return files


def main() -> int:
    files = relaxed_files()
    project = (BACKEND / "pyproject.toml").read_text(encoding="utf-8")
    listed = {f[:-3].replace("/", ".") for f in files}
    skipped = set(re.findall(r'^\s+"(app\.[\w.]+)",$', project, re.M))
    if listed != skipped:
        print(
            "pyproject.toml 的 mypy overrides 要與 mypy-classroom.ini 列同一組模組：",
            sorted(listed ^ skipped),
        )
        return 1
    exclude = "|".join(re.escape(f) for f in files)
    core = subprocess.run(
        [sys.executable, "-m", "mypy", "app", "--exclude", f"^({exclude})$"], cwd=BACKEND
    )
    classroom = subprocess.run(
        [sys.executable, "-m", "mypy", "--config-file", "mypy-classroom.ini", *files], cwd=BACKEND
    )
    return core.returncode or classroom.returncode


if __name__ == "__main__":
    raise SystemExit(main())

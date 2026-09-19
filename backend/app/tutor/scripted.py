from pathlib import Path
from typing import Any

import yaml

from app.domain.tutor import ProviderRequest, ProviderResponse


class ScriptedProvider:
    """驗收用的 provider：只看「第幾輪」，不看學生打了什麼。

    行為百分之百可重現，代價是學生打什麼都一樣。團隊試玩想要真實反應時
    切換到真 provider（設計規格 §12）。
    """

    def __init__(self, script: dict[str, Any]) -> None:
        self._script = script

    @classmethod
    def load(cls, path: str) -> "ScriptedProvider":
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or "stages" not in raw or "summary" not in raw:
            raise ValueError(f"腳本檔格式錯誤：{path}")
        return cls(raw)

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        if request.kind == "summarize":
            return dict(self._script["summary"])

        turns = self._script["stages"][request.stage_key]["turns"]
        index = min(request.turn_index, len(turns) - 1)
        return dict(turns[index])

from pathlib import Path
from typing import Any

import yaml

from app.domain.tutor import ProviderRequest, ProviderResponse, SummaryDraft


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
            draft = SummaryDraft.model_validate(self._script["summary"])
            reached = set(request.reached_stage_keys)
            entries = [entry for entry in draft.stance_by_stage if entry.stage_key in reached]
            if not entries:
                raise ValueError("script has no summary stance for the reached stages")
            if not set(self._script["stages"]).issubset(reached):
                # 全階梯的自由文字沒有單階證據；部分路徑只使用作者已寫的已進入階立場。
                draft = draft.model_copy(
                    update={
                        "core_principle": "；".join(
                            entry.note or entry.label for entry in entries
                        ),
                        "tension": "",
                    }
                )
            return draft.model_copy(update={"stance_by_stage": entries}).model_dump()

        turns = self._script["stages"][request.stage_key]["turns"]
        index = min(request.turn_index, len(turns) - 1)
        return dict(turns[index])

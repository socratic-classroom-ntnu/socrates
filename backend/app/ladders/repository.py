from pathlib import Path

import yaml
from pydantic import ValidationError

from app.domain.ladder import Ladder, Stage


class LadderRepository:
    def __init__(self, ladder: Ladder) -> None:
        self._ladder = ladder

    @classmethod
    def load(cls, path: str) -> "LadderRepository":
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"ladder 定義檔格式錯誤：{path}")
        payload = {**raw, "extra_turns_cap": (raw.get("wrap_up") or {}).get("extra_turns_cap", 3)}
        payload.pop("wrap_up", None)
        try:
            ladder = Ladder.model_validate(payload)
        except ValidationError as exc:
            raise ValueError(f"ladder 定義檔不合法：{path}\n{exc}") from exc
        return cls(ladder)

    def get(self) -> Ladder:
        return self._ladder

    def stage(self, index: int) -> Stage:
        return self._ladder.stages[index]

    @property
    def total_stages(self) -> int:
        return len(self._ladder.stages)

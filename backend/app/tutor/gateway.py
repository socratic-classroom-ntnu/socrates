from typing import TypeVar

from pydantic import BaseModel

from app.domain.ladder import Stage
from app.domain.tutor import (
    ProviderRequest, PromptMessage, SummaryDraft, TutorTurn,
)
from app.tutor.provider import LLMProvider


class TutorUnavailable(RuntimeError):
    """provider 失敗或回傳格式不合，重試後仍無法取得合法結果。"""


ModelT = TypeVar("ModelT", bound=BaseModel)


class TutorGateway:
    """唯一知道 LLM 存在的地方。不知道任何推進規則（設計規格 §5.1）。

    pre-processor → provider → post-processor。未來的反諂媚檢查、安全過濾
    都加在這兩端，不用動其他任何地方。
    """

    _MAX_ATTEMPTS = 2

    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    def respond(
        self, stage: Stage, history: list[PromptMessage], turn_index: int
    ) -> TutorTurn:
        request = self._build_respond_request(stage, history, turn_index)
        return self._call(request, TutorTurn)

    def summarize(self, history: list[PromptMessage]) -> SummaryDraft:
        request = ProviderRequest(
            kind="summarize", stage_key=None, turn_index=0, messages=history
        )
        return self._call(request, SummaryDraft)

    def _build_respond_request(
        self, stage: Stage, history: list[PromptMessage], turn_index: int
    ) -> ProviderRequest:
        # pre-processor：目前只組裝請求。之後的脫敏、離題偵測加在這裡。
        return ProviderRequest(
            kind="respond",
            stage_key=stage.key,
            turn_index=turn_index,
            messages=history,
        )

    def _call(self, request: ProviderRequest, model: type[ModelT]) -> ModelT:
        last_error: Exception | None = None
        for _ in range(self._MAX_ATTEMPTS):
            try:
                raw = self._provider.generate(request)
                # post-processor：格式驗證。之後的反諂媚檢查加在這裡。
                return model.model_validate(raw)
            except Exception as exc:
                # provider 邊界統一轉成可重試的 503；不要讓連線錯誤變成未處理的 500。
                last_error = exc
        raise TutorUnavailable(str(last_error))

from typing import TypeVar, cast

from pydantic import BaseModel

from app.domain.ladder import Stage
from app.domain.tutor import (
    ProviderRequest,
    PromptMessage,
    SummaryDraft,
    TutorTurn,
)
from app.tutor import iron_rules
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

    def respond(self, stage: Stage, history: list[PromptMessage], turn_index: int) -> TutorTurn:
        request = self._build_respond_request(stage, history, turn_index)
        latest = [m.content for m in history if m.role == "student"][-1:]
        hint = iron_rules.screen_input({"history": latest})
        return self._call(request, TutorTurn, kind="solo_tutor", hint=hint)

    def summarize(self, history: list[PromptMessage]) -> SummaryDraft:
        request = ProviderRequest(kind="summarize", stage_key=None, turn_index=0, messages=history)
        return self._call(request, SummaryDraft, kind="solo_summary")

    def _build_respond_request(
        self, stage: Stage, history: list[PromptMessage], turn_index: int
    ) -> ProviderRequest:
        # pre-processor：組裝請求；指令覆寫偵測（鐵則）在 respond 做，結果交給 post-processor。
        return ProviderRequest(
            kind="respond",
            stage_key=stage.key,
            turn_index=turn_index,
            messages=history,
        )

    def _call(
        self, request: ProviderRequest, model: type[ModelT], *, kind: str, hint: str = ""
    ) -> ModelT:
        last_error: Exception | None = None
        parsed: ModelT | None = None
        for _ in range(self._MAX_ATTEMPTS):
            try:
                raw = self._provider.generate(request)
                # post-processor：格式驗證，再做鐵則檢查（不透露設定；被要求改寫規則時要提問拉回）。
                parsed = model.model_validate(raw)
            except Exception as exc:
                # provider 邊界統一轉成可重試的 503；不要讓連線錯誤變成未處理的 500。
                last_error = exc
                continue
            if not iron_rules.check(kind, parsed.model_dump(), hint):
                return parsed
        if parsed is not None:
            # 兩次都沒通過鐵則：可見文字換成固定的拉回句（摘要沒有可見對話，保留內容）。
            if isinstance(parsed, TutorTurn):
                replaced = parsed.model_copy(update={"reply_text": iron_rules.fallback_text(kind)})
                return cast(ModelT, replaced)
            return parsed
        raise TutorUnavailable(str(last_error))

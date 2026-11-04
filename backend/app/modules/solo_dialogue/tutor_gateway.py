from typing import TypeVar, cast

from pydantic import BaseModel

from app.modules.content_authoring.service import Stage
from app.modules.solo_dialogue.tutor_contracts import (
    ProviderRequest,
    PromptMessage,
    SummaryDraft,
    TutorTurn,
)
from app.modules.llm_runtime import service as iron_rules
from app.modules.solo_dialogue.tutor_provider import LLMProvider


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

    def summarize(
        self, history: list[PromptMessage], reached_stage_keys: tuple[str, ...]
    ) -> SummaryDraft:
        request = ProviderRequest(
            kind="summarize",
            stage_key=None,
            turn_index=0,
            messages=history,
            reached_stage_keys=reached_stage_keys,
        )
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
            reached_stage_keys=(),
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
                candidate = model.model_validate(raw)
                if isinstance(candidate, SummaryDraft) and any(
                    entry.stage_key not in request.reached_stage_keys
                    for entry in candidate.stance_by_stage
                ):
                    raise ValueError("summary contains a stage outside the reached scope")
                parsed = candidate
            except Exception as exc:
                # provider 邊界統一轉成可重試的 503；不要讓連線錯誤變成未處理的 500。
                last_error = exc
                continue
            reason = iron_rules.check(kind, parsed.model_dump(), hint)
            if not reason:
                return parsed
            last_error = ValueError(reason)
        if isinstance(parsed, TutorTurn):
            # 導師對話保留既有拉回句；摘要交由呼叫端的失敗流程處理。
            replaced = parsed.model_copy(update={"reply_text": iron_rules.fallback_text(kind)})
            return cast(ModelT, replaced)
        raise TutorUnavailable(str(last_error))

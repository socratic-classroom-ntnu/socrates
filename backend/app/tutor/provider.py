from typing import Protocol

from app.domain.tutor import ProviderRequest, ProviderResponse


class LLMProvider(Protocol):
    """唯一與外部模型對話的介面。

    回傳未驗證的 dict：驗證由 TutorGateway 的 post-processor 負責，
    這樣「provider 回傳壞格式」是可以被測試注入的情況。
    """

    def generate(self, request: ProviderRequest) -> ProviderResponse: ...

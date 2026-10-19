from pydantic import Field, field_validator
from app.modules.platform.model_base import TrimmedModel


class SendMessageRequest(TrimmedModel):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("訊息不可為空白")
        return value

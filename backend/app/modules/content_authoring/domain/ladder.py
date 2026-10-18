from pydantic import BaseModel, Field


class Stage(BaseModel):
    key: str
    title: str
    opening_statement: str
    teaching_goal: str
    probe_hints: list[str] = Field(default_factory=list)
    max_turns: int = Field(gt=0)


class Ladder(BaseModel):
    id: str
    version: int
    title: str
    stages: list[Stage] = Field(min_length=1)
    extra_turns_cap: int = Field(default=3, ge=0)

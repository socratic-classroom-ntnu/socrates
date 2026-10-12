"""docs/classroom/ 的結構文件必須與 pydantic 模型逐欄一致（issue #13）。

SCRIPT-SCHEMA.md（劇本／題目）與 LLM-OUTPUT-SCHEMA.md（每種 LLM 呼叫的輸出）的欄位表，比對欄位集合、
型別、必填、預設值與長度／數值限制，以及送給 provider 的 JSON Schema 的 `required`；文件中每份 JSON 範例
都必須通過對應模型。模型、programs.json 或文件任一邊改了而另一邊沒跟上就失敗。
"""

import json
import re
from pathlib import Path
from typing import Literal, get_args, get_origin

import pytest
from pydantic import BaseModel

from app.api import classroom_schemas as schemas
from app.api.classroom_schemas import (
    DynamicResult,
    LLMStudentTurn,
    Observations,
    Option,
    OtherSuggestionResult,
    PersonalSummary,
    PersonalTutorTurn,
    Question,
    ScriptDocument,
    SummaryResult,
    TutorTurn,
)
from app.api.routes.ai_students import OtherSuggestionRequest, fallback_other_suggestion
from app.domain.group_run import DEFAULT_MAX_PERSONAL_TURNS, DEFAULT_PERSONAL_SECONDS
from app.services.llm_workers import deterministic_result
from app.tutor.prompts import JOB_KINDS, ROOT, SCHEMAS
from tests.classroom.test_groups import document

DOCS = Path(__file__).resolve().parents[3] / "docs" / "classroom"
# 文件在 repo 根目錄的 docs/；只掛 backend/ 的容器（compose exec backend）讀不到，略過，由 CI 的完整 checkout 執行。
pytestmark = pytest.mark.skipif(not DOCS.is_dir(), reason="docs/classroom 不在這個 checkout 裡")
SCRIPT_DOC = DOCS / "SCRIPT-SCHEMA.md"
LLM_DOC = DOCS / "LLM-OUTPUT-SCHEMA.md"
SCRIPT_MODELS = (ScriptDocument, Question, Option)
LLM_MODELS = (
    TutorTurn,
    Observations,
    PersonalTutorTurn,
    PersonalSummary,
    SummaryResult,
    DynamicResult,
    LLMStudentTurn,
    OtherSuggestionResult,
)
CONSTRAINT = re.compile(r"`(min_length|max_length|ge|le|gt|lt)=(-?\d+)`")
HEADING = re.compile(r"###\s+`(\w+)`\s*")


def sections(path: Path) -> dict[str, list[str]]:
    """`### `Model`` 標題到下一個標題之間的行。"""
    result: dict[str, list[str]] = {}
    current = None
    for line in path.read_text(encoding="utf-8").splitlines():
        heading = HEADING.fullmatch(line)
        if heading:
            current = heading.group(1)
            result[current] = []
        elif line.startswith("#"):
            current = None
        elif current is not None:
            result[current].append(line)
    return result


def table(lines: list[str]) -> list[dict[str, str]]:
    """第一張 Markdown 表格 → 每列 {欄名: 內容}。"""
    rows: list[dict[str, str]] = []
    header = None
    for line in lines:
        if not line.startswith("|"):
            if header is not None:
                break
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            header = cells
        elif not set("".join(cells)) <= set("-: "):
            rows.append(dict(zip(header, cells)))
    return rows


def fields(path: Path, model: type[BaseModel]) -> dict[str, dict[str, str]]:
    lines = sections(path).get(model.__name__)
    assert lines, f"{path.name} 缺少 ### `{model.__name__}` 欄位表"
    return {row["欄位"].strip("`"): row for row in table(lines)}


def examples(path: Path, model: type[BaseModel]) -> list[str]:
    text = "\n".join(sections(path)[model.__name__])
    return re.findall(r"```json\n(.*?)```", text, re.DOTALL)


def type_name(annotation) -> str:
    if annotation is str:
        return "string"
    if annotation is int:
        return "integer"
    if annotation is bool:
        return "boolean"
    if get_origin(annotation) is list:
        return f"array<{type_name(get_args(annotation)[0])}>"
    if get_origin(annotation) is Literal:
        return "enum(" + ", ".join(get_args(annotation)) + ")"
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation.__name__
    raise AssertionError(f"文件測試不認得的型別：{annotation!r}")


def constraints(field) -> set[tuple[str, int]]:
    found = set()
    for item in field.metadata:
        for key in ("min_length", "max_length", "ge", "le", "gt", "lt"):
            if getattr(item, key, None) is not None:
                found.add((key, int(getattr(item, key))))
    return found


def assert_documented(path: Path, model: type[BaseModel]) -> None:
    documented = fields(path, model)
    assert set(documented) == set(model.model_fields), f"{model.__name__}：欄位集合與模型不一致"
    assert model.model_config.get("extra") == "forbid", model.__name__
    for name, field in model.model_fields.items():
        row = documented[name]
        where = f"{model.__name__}.{name}"
        assert row["型別"].strip("`") == type_name(field.annotation), where
        assert row["必填"] == ("是" if field.is_required() else "否"), where
        if field.is_required():
            assert row["預設"] == "—", where
        else:
            default = field.get_default(call_default_factory=True)
            assert json.loads(row["預設"].strip("`")) == default, where
        listed = {(k, int(v)) for k, v in CONSTRAINT.findall(row["限制"])}
        assert listed == constraints(field), where
    # The JSON Schema handed to providers requires exactly the fields marked 必填.
    required = set(model.model_json_schema().get("required", []))
    assert required == {n for n, r in documented.items() if r["必填"] == "是"}, model.__name__


@pytest.mark.parametrize("model", SCRIPT_MODELS, ids=lambda m: m.__name__)
def test_script_schema_doc_matches_model(model):
    assert_documented(SCRIPT_DOC, model)


@pytest.mark.parametrize("model", LLM_MODELS, ids=lambda m: m.__name__)
def test_llm_output_doc_matches_model(model):
    assert_documented(LLM_DOC, model)


@pytest.mark.parametrize("model", LLM_MODELS, ids=lambda m: m.__name__)
def test_llm_output_doc_examples_validate(model):
    found = examples(LLM_DOC, model)
    assert found, f"LLM-OUTPUT-SCHEMA.md 的 `{model.__name__}` 一節應附 JSON 範例"
    for raw in found:
        model.model_validate(json.loads(raw))


def test_script_schema_doc_example_and_fixture_validate():
    text = SCRIPT_DOC.read_text(encoding="utf-8")
    example = re.search(r"```json\n(.*?)```", text, re.DOTALL)
    assert example, "SCRIPT-SCHEMA.md 應附一份 JSON 範例"
    ScriptDocument.model_validate(json.loads(example.group(1)))
    # 分組測試用的完整劇本也必須符合文件描述的契約。
    ScriptDocument.model_validate(document())


def test_personal_defaults_have_one_value():
    """group_run 讀舊題目時的後備值必須等於模型（與文件）的預設。"""
    defaults = Question.model_fields
    assert defaults["max_personal_turns"].default == DEFAULT_MAX_PERSONAL_TURNS
    assert defaults["personal_seconds"].default == DEFAULT_PERSONAL_SECONDS


def job_table() -> dict[str, str]:
    lines = LLM_DOC.read_text(encoding="utf-8").split("## 工作與輸出模型", 1)[1].splitlines()
    return {row["工作"].strip("`"): row["輸出模型"].strip("`") for row in table(lines)}


def test_job_table_matches_programs():
    programs = json.loads((ROOT / "prompts/classroom/programs.json").read_text())["programs"]
    documented = job_table()
    assert set(JOB_KINDS) <= set(documented), "每種 LLM 工作都要列在「工作與輸出模型」"
    for kind in JOB_KINDS:
        assert documented[kind] == programs[kind]["schema"], kind
        assert SCHEMAS[documented[kind]].__name__ == documented[kind]
    # 文件提到的每個輸出模型都存在且有欄位表。
    for kind, name in documented.items():
        model = getattr(schemas, name, None)
        assert isinstance(model, type) and issubclass(model, BaseModel), (kind, name)
        assert model in LLM_MODELS, f"{name} 需要在 LLM-OUTPUT-SCHEMA.md 有欄位表"


@pytest.mark.parametrize(
    ("kind", "model", "context"),
    [
        ("question_summary", SummaryResult, {"answers": [{}]}),
        ("class_summary", SummaryResult, {}),
        ("personal_summary", SummaryResult, {}),
        ("dynamic_question", DynamicResult, {}),
        (
            "llm_student_turn",
            LLMStudentTurn,
            {
                "question": {
                    "options": [{"id": "a", "text": "甲"}, {"id": "__other__", "text": "其他"}]
                },
                "persona": {"values": ["公平"]},
                "action_mode": "viewpoint",
            },
        ),
    ],
)
def test_documented_fallbacks_match_their_models(kind, model, context):
    result, audit = deterministic_result(
        {"kind": kind, "key": kind + ":k", "context": context}, "X"
    )
    model.model_validate(result)
    assert audit["fallback_used"] is True


def test_tutor_fallbacks_are_pause_signals_not_turns():
    for kind in ("focused_tutor", "personal_tutor"):
        result, _ = deterministic_result({"kind": kind, "key": "k", "context": {}}, "X")
        assert result == {"tutor_unavailable": "X"}


def test_other_suggestion_fallback_matches_model():
    body = OtherSuggestionRequest(question_id="q1", title="題目", scenario="情境")
    OtherSuggestionResult.model_validate(
        {"suggestion_text": fallback_other_suggestion(body)["suggestion_text"]}
    )

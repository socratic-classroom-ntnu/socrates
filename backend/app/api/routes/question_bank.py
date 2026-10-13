"""題庫商店：老師把劇本中的單一題目發布出來，其他老師可搜尋、預覽並加入自己的劇本。

發布時只保存題目本身（經過 Question 驗證），去掉擁有者或 AI 服務相關的設定；
加入劇本時重新給一個在該劇本內不會撞號的題目 id，並讓劇本版本 +1。
"""

from copy import deepcopy
import time
from uuid import UUID, uuid4, uuid5

from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field, ValidationError, field_validator
from app.api.model_base import TrimmedModel
from sqlalchemy import and_, func, select

from app.modules.content_authoring.contracts import Question, ScriptDocument
from app.modules.platform.errors import DomainError
from app.repositories.classroom_storage import Account, BankQuestion, Script, transaction

# 每份劇本最多可放的題目數；加入題庫題目時超過就拒絕。
MAX_SCRIPT_QUESTIONS = 50
# 發布或加入時一律去掉的欄位：屬於原作者帳號或 AI 服務的設定，不能跟著題目流到別人的劇本。
STRIPPED_KEYS = ("scenario_ai", "provider_profile_id")
MAX_TAGS = 8
PAGE_LIMIT = 50


class BankMutation(TrimmedModel):
    action_id: str = Field(min_length=8, max_length=100)


class Publish(BankMutation):
    script_id: str = Field(min_length=1, max_length=36)
    question_id: str = Field(min_length=1, max_length=64)
    title: str | None = Field(default=None, max_length=300)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for raw in value:
            tag = raw.strip()
            if not tag:
                continue
            if len(tag) > 30:
                raise ValueError("每個標籤最多 30 字")
            if tag not in seen:
                seen.append(tag)
        return seen


class ImportQuestion(BankMutation):
    script_id: str = Field(min_length=1, max_length=36)


class BankQuestionSummary(BaseModel):
    id: str
    title: str
    tags: list[str]
    scenario_excerpt: str
    option_count: int
    author: str | None
    mine: bool
    published_at: float
    revision: int
    source_script_id: str | None = None
    source_question_id: str | None = None


class BankQuestionDetail(BankQuestionSummary):
    question: Question


class BankSearchResult(BaseModel):
    items: list[BankQuestionSummary]
    total: int
    offset: int
    limit: int


class BankUnpublishResult(BaseModel):
    id: str
    status: str


class BankImportResult(BaseModel):
    id: str
    revision: int
    question_id: str
    document: ScriptDocument


router = APIRouter(prefix="/bank")


def user(db, request, mutation=False):
    from app.modules.identity_access.dependencies import account

    return account(db, request, mutation)[0]


def _mutate(db, account, operation, body, action):
    from app.modules.content_authoring.service import mutate

    return mutate(db, account, operation, body, action)


def clean_question(value: dict) -> dict:
    """Validated copy of one question without owner/provider-specific settings."""
    raw = deepcopy(value) if isinstance(value, dict) else {}
    for key in STRIPPED_KEYS:
        raw.pop(key, None)
    try:
        question = Question.model_validate(raw).model_dump()
    except ValidationError as exc:
        raise DomainError("BANK_QUESTION_INVALID", 422) from exc
    for key in STRIPPED_KEYS:
        question.pop(key, None)
    return question


def _search_text(title: str, question: dict, tags: list[str]) -> str:
    parts = [title, question.get("title", ""), question.get("scenario", ""), *tags]
    parts += [option.get("text", "") for option in question.get("options", [])]
    return "\n".join(str(part) for part in parts).lower()


def _owned_script(db, script_id, account, lock=False):
    query = select(Script).where(Script.id == script_id)
    if lock:
        query = query.with_for_update()
    script = db.scalar(query)
    if script is None or script.owner_id != account.id:
        raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
    return script


def _view(db, row: BankQuestion, account, full=False) -> dict:
    owner = db.get(Account, row.owner_id)
    question = row.question
    item = {
        "id": row.id,
        "title": row.title,
        "tags": list(row.tags or []),
        "scenario_excerpt": question.get("scenario", "")[:160],
        "option_count": len(question.get("options", [])),
        "author": owner.username if owner else None,
        "mine": row.owner_id == account.id,
        "published_at": row.published_at,
        "revision": row.revision,
    }
    if full:
        item["question"] = deepcopy(question)
    if row.owner_id == account.id:
        item["source_script_id"] = row.source_script_id
        item["source_question_id"] = row.source_question_id
    return item


@router.post("/questions", response_model=BankQuestionDetail, response_model_exclude_none=True)
def publish(body: Publish, request: Request):
    with transaction() as db:
        account = user(db, request, True)

        def action():
            script = _owned_script(db, body.script_id, account)
            source = next(
                (
                    q
                    for q in script.document.get("questions", [])
                    if isinstance(q, dict) and q.get("id") == body.question_id
                ),
                None,
            )
            if source is None:
                raise DomainError("BANK_SOURCE_QUESTION_REQUIRED", 404)
            question = clean_question(source)
            title = (body.title or "").strip() or question["title"]
            # 同一份劇本的同一題再次發布＝更新原本那筆，而不是多一筆重複的題目。
            row = db.scalar(
                select(BankQuestion)
                .where(
                    BankQuestion.owner_id == account.id,
                    BankQuestion.source_script_id == script.id,
                    BankQuestion.source_question_id == body.question_id,
                )
                .with_for_update()
            )
            if row is None:
                row = BankQuestion(
                    id=str(uuid5(UUID(account.id), "bank-question:" + body.action_id)),
                    owner_id=account.id,
                    source_script_id=script.id,
                    source_question_id=body.question_id,
                    revision=1,
                )
                db.add(row)
            else:
                row.revision += 1
            row.title = title
            row.question = question
            row.tags = body.tags
            row.search_text = _search_text(title, question, body.tags)
            row.published_at = time.time()
            db.flush()
            return _view(db, row, account, full=True)

        return _mutate(db, account, "bank-publish", body, action)


@router.get("/questions", response_model=BankSearchResult, response_model_exclude_none=True)
def search(
    request: Request,
    q: Annotated[str, Query(max_length=200)] = "",
    offset: int = 0,
    limit: int = 20,
    mine: bool = False,
):
    offset = max(0, offset)
    limit = min(max(1, limit), PAGE_LIMIT)
    with transaction() as db:
        account = user(db, request)
        conditions = [
            BankQuestion.search_text.contains(term, autoescape=True)
            for term in q.lower().split()[:8]
        ]
        if mine:
            conditions.append(BankQuestion.owner_id == account.id)
        where = and_(*conditions) if conditions else None
        count = select(func.count()).select_from(BankQuestion)
        rows = select(BankQuestion).order_by(BankQuestion.published_at.desc(), BankQuestion.id)
        if where is not None:
            count = count.where(where)
            rows = rows.where(where)
        total = db.scalar(count) or 0
        items = db.scalars(rows.offset(offset).limit(limit)).all()
        return {
            "items": [_view(db, row, account) for row in items],
            "total": total,
            "offset": offset,
            "limit": limit,
        }


@router.get(
    "/questions/{bank_id}", response_model=BankQuestionDetail, response_model_exclude_none=True
)
def detail(bank_id: str, request: Request):
    with transaction() as db:
        account = user(db, request)
        row = db.get(BankQuestion, bank_id)
        if row is None:
            raise DomainError("BANK_QUESTION_REQUIRED", 404)
        return _view(db, row, account, full=True)


@router.post("/questions/{bank_id}/unpublish", response_model=BankUnpublishResult)
def unpublish(bank_id: str, body: BankMutation, request: Request):
    with transaction() as db:
        account = user(db, request, True)

        def action():
            row = db.scalar(
                select(BankQuestion).where(BankQuestion.id == bank_id).with_for_update()
            )
            if row is None:
                raise DomainError("BANK_QUESTION_REQUIRED", 404)
            if row.owner_id != account.id:
                raise DomainError("BANK_OWNER_REQUIRED", 403)
            db.delete(row)
            db.flush()
            return {"id": bank_id, "status": "UNPUBLISHED"}

        return _mutate(db, account, "bank-unpublish:" + bank_id, body, action)


def _fresh_id(existing: set[str]) -> str:
    while True:
        candidate = "bank-" + uuid4().hex[:10]
        if candidate not in existing:
            return candidate


@router.post("/questions/{bank_id}/import", response_model=BankImportResult)
def import_question(bank_id: str, body: ImportQuestion, request: Request):
    with transaction() as db:
        account = user(db, request, True)

        def action():
            row = db.get(BankQuestion, bank_id)
            if row is None:
                raise DomainError("BANK_QUESTION_REQUIRED", 404)
            script = _owned_script(db, body.script_id, account, lock=True)
            document = deepcopy(script.document)
            questions = document.setdefault("questions", [])
            if len(questions) >= MAX_SCRIPT_QUESTIONS:
                raise DomainError("BANK_SCRIPT_QUESTION_LIMIT", 422)
            question = clean_question(row.question)
            question["id"] = _fresh_id({str(q.get("id")) for q in questions if isinstance(q, dict)})
            questions.append(question)
            try:
                saved = ScriptDocument.model_validate(document).model_dump()
            except ValidationError as exc:
                raise DomainError("BANK_IMPORT_INVALID", 422) from exc
            script.document = saved
            script.revision += 1
            db.flush()
            return {
                "id": script.id,
                "revision": script.revision,
                "question_id": question["id"],
                "document": script.document,
            }

        return _mutate(db, account, "bank-import:" + bank_id, body, action)

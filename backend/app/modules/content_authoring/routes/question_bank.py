"""題庫商店：老師把劇本中的單一題目發布出來，其他老師可搜尋、預覽並加入自己的劇本。

發布時只保存題目本身（經過 Question 驗證），去掉擁有者或 AI 服務相關的設定；
加入劇本時重新給一個在該劇本內不會撞號的題目 id，並讓劇本版本 +1。
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.modules.platform.errors import DomainError
from app.modules.content_authoring.repositories import BankQuestion
from app.modules.platform.storage import transaction
from app.modules.content_authoring.contracts import (
    BankImportResult,
    BankMutation,
    BankQuestionDetail,
    BankSearchResult,
    BankUnpublishResult,
    ImportQuestion,
    Publish,
)
from app.modules.content_authoring.service import (
    PAGE_LIMIT,
    _view,
    user,
)
from app.modules.content_authoring.service import (
    publish_questions,
    search_bank,
    unpublish_question,
    import_bank_question,
)


router = APIRouter(prefix="/bank")


@router.post("/questions", response_model=BankQuestionDetail, response_model_exclude_none=True)
def publish(body: Publish, request: Request):
    with transaction() as db:
        account = user(db, request, True)

        return publish_questions(db, account, body)


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
        return search_bank(db, account, q, offset, limit, mine)


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

        return unpublish_question(db, account, bank_id, body)


@router.post("/questions/{bank_id}/import", response_model=BankImportResult)
def import_question(bank_id: str, body: ImportQuestion, request: Request):
    with transaction() as db:
        account = user(db, request, True)

        return import_bank_question(db, account, bank_id, body)

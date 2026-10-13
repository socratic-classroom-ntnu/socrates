# Content Authoring

## Purpose

劇本、題目、題庫、ladder、AI 協助出題與版本化內容。

## Ownership

| Role | Seat |
|---|---|
| Backend default owner | `Portal-Goose` |
| Frontend default implementation owner | `Portal-Heron` |
| Visual owner | `Design-Goose` |
| Partitioning／acceptance PO | `PO-Goose` |

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ❌）

後端（default owner：Portal-Goose）：
- `backend/app/api/routes/classroom_library.py`
- `backend/app/api/routes/question_bank.py`
- `backend/app/api/routes/script_assist.py`
- `backend/app/domain/library_decisions.py`
- `backend/app/domain/ladder.py`
- `backend/app/ladders/`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/features/script-builder/`
- `frontend/src/features/question-bank/`
- `frontend/src/pages/QuestionBank.tsx`
- `frontend/src/pages/ClassroomLibrary.tsx`

## 待清項（源頭修正，做完從這裡刪掉）

- routes/classroom_library.py 定義 ORM（ClassroomAssets、SessionLink、LibraryReceipt）：移到 repositories。
- routes/script_assist.py、question_bank.py 的流程邏輯下移到 service；兩者 import routes/classroom、classroom_library。
- frontend script-builder 反向引用 pages/ProviderSettings（隨 LLM Runtime 那項一起解）。
<!-- module-map:end -->

## Public contract

- ScriptDocument
- QuestionBank projection
- assist draft result
- ladder validation

## Toy page

本模組使用既有`frontend/src/features/dev-console/`註冊fixture與操作面板。Toy page與production frontend共用generated client、ViewModel與reason codes。

## Acceptance package

- API contract與generated types同步。
- Toy page完成happy path、typed error、permission、retry／idempotency與boundary fixtures。
- Backend module tests與Frontend adapter tests各自通過。
- Default owner review receipt成立。
- Compatibility ledger同步更新。
- Source、caller、generated artifacts與handoff文件形成同一successor。

## First metabolism

1. 固定 script/question public contract 與版本欄位。
2. toy page 可建立、驗證、預覽、發布、匯入一題。
3. generated types 與 schema docs 同步成為完成條件。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

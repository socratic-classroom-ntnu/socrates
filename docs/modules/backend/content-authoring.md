# Content Authoring（後端）

## Purpose

劇本、題目、題庫、ladder、AI 協助出題與版本化內容。

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
- 審查通過。
- Compatibility ledger同步更新。
- 源頭、呼叫端、generated artifacts與交接文件在同一個commit更新。

## 第一批工作

1. 固定 script/question public contract 與版本欄位。
2. toy page 可建立、驗證、預覽、發布、匯入一題。
3. generated types 與 schema docs 同步成為完成條件。

## Scope rules

- 本模組範圍內的變更經審查後合併。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、identity-access、ai-providers、llm-runtime

檔案範圍：
- `backend/app/modules/content_authoring/`

契約：
- 出題與題庫（/library/*、/question-bank/*、/script-assist/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 5 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：POST /api/v2/scripts、PUT /api/v2/scripts/{script_id}、POST /api/v2/scripts/import、GET /api/v2/scripts/{script_id}/yaml、POST /api/v2/scripts/assist
<!-- module-map:end -->

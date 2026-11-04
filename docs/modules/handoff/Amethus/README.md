# Amethus 交接包：D 包（對接）

你負責前後端唯一的契約接縫：讓後端端點有完整的 request、response 與 reason code 契約，並讓前端只使用產生的型別與 contract client。

## 先讀

1. [D 包工作與送 PR 規則](../D-contract.md)
2. [後端 contract 模組邊界](../../backend/contract.md)
3. [前端 contract 模組邊界](../../frontend/contract.md)
4. [模組責任地圖](../../README.md)
5. [六項新功能與 API 關係](../../../classroom/NEW-FEATURES.md)

具體順序與進度見 [TASKS.md](TASKS.md)。
審新端點時使用 [新端點契約檢查表](../../../../backend/app/modules/contract/NEW_ENDPOINT_CHECKLIST.md)。

## 責任範圍

- 維護 `backend/app/modules/contract/` 的 OpenAPI 入口、reason code 目錄與 `RESPONSE_MODEL_PENDING`。
- 維護 `frontend/src/contract/` 的 generated types、HTTP／WebSocket client 與錯誤文字。
- 審查 B、C 包新端點的 `response_model`、reason code 與型別產物。
- 與其他包協作定義統整引用、雷達與 TTS 等共用公開契約。
- 把前端的契約需求轉給擁有該端點的後端模組負責人。

## 邊界

- Contract 模組只收集跨模組契約，不放業務 model 或業務邏輯。
- B、C 包擁有端點與業務 schema；D 包不直接代寫它們的實作。
- `RESPONSE_MODEL_PENDING` 只能變短；新端點不能靠加入清單繞過 `response_model`。
- Reason code 由第一次實際 raise 它的 PR 同時登記，不預先放入目錄。
- `frontend/classroom-openapi.json` 與 `frontend/src/contract/classroomTypes.ts` 是產生物，不手寫。
- 前端只依後端的 `available_actions` 顯示動作，不另外推導狀態機。

## 協作流程

1. 從 `backend/Amethus/main` 開 `backend/Amethus/<主題>` 分支。
2. 一個功能或可獨立合入的契約改動開一個 PR 到 `backend/main`。
3. `backend/main` 有新改動時，先 merge 進自己的分支再繼續。
4. 改到別包的檔案時分開送 PR，由該模組負責人審查。
5. 送 PR 前跑 [D-contract.md](../D-contract.md#送-pr-前的檢查) 列出的完整檢查。

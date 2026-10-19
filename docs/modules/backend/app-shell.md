# App Shell（後端）

組裝層：建 FastAPI app、掛各模組的 router、啟動背景工作。只做接線。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：全部（組裝層）

檔案範圍：
- `backend/app/main.py`
- `backend/app/classroom_app.py`
- `backend/app/classroom_server.py`
- `backend/app/modules/app_shell/`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 1 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：GET /api/v2/readiness
<!-- module-map:end -->

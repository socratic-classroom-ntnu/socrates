# App Shell（後端）

組裝層：建 FastAPI app、掛各模組的 router、啟動背景工作。只做接線。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：全部（組裝層）

檔案範圍：
- `backend/app/main.py`
- `backend/app/classroom_app.py`
- `backend/app/classroom_server.py`
- `backend/app/modules/app_shell/`
- `backend/app/api/deps.py`
- `backend/app/api/routes/`
- `backend/app/orchestrator/classroom.py`
- `backend/app/services/classroom.py`
- `backend/app/services/llm_workers.py`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- Transport adapters and cross-module coordinators are composed here; domain behavior remains behind module services/contracts.
<!-- module-map:end -->

# Identity & Access（後端）

帳號、登入、Email 驗證、重設密碼與寄信。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform

檔案範圍：
- `backend/app/services/classroom_auth.py`
- `backend/app/services/email_delivery.py`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `identity_access→classroom_core  backend/app/services/classroom_auth.py → backend/app/orchestrator/classroom.py`
- `identity_access→classroom_core  backend/app/services/email_delivery.py → backend/app/orchestrator/classroom.py`
- `orm-outside-repositories  backend/app/services/email_delivery.py`

## 待清項（源頭修正，做完從這裡刪掉）

- /auth/* 端點目前寫在 classroom_core 的 routes/classroom.py：抽到本模組的 api/routes/auth.py。
- services/email_delivery.py 定義 ORM：移到本模組 repositories/。
<!-- module-map:end -->

# Platform（後端）

資料庫連線、設定、環境變數、交易邊界、即時事件匯流排與公開設定端點；不依賴任何業務模組。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：不依賴其他模組

檔案範圍：
- `backend/app/modules/platform/`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `platform→ai_providers  backend/app/modules/platform/repositories/classroom_storage.py → backend/app/modules/ai_providers/api/routes/provider_profiles.py`
- `platform→content_authoring  backend/app/modules/platform/repositories/classroom_storage.py → backend/app/modules/content_authoring/api/routes/classroom_library.py`
- `platform→group_dialogue  backend/app/modules/platform/repositories/classroom_storage.py → backend/app/services/ai_students.py`
- `platform→identity_access  backend/app/modules/platform/repositories/classroom_storage.py → backend/app/modules/identity_access/services/email_delivery.py`

## 待清項（源頭修正，做完從這裡刪掉）

- repositories/classroom_storage.py 為了建表與清理而延遲 import 業務模組（classroom_library、provider_profiles、ai_students、email_delivery）：各模組的 ORM 歸位後刪掉這段。
<!-- module-map:end -->

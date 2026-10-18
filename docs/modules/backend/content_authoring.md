# Content Authoring（後端）

課程、題本與教材：課程資產、題本附掛、場次建立、單人對話的階梯（ladder）。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、identity_access、ai_providers、llm_runtime

檔案範圍：
- `backend/app/modules/content_authoring/`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `content_authoring→classroom_core  backend/app/modules/content_authoring/api/routes/classroom_library.py → backend/app/modules/classroom_core/api/classroom_schemas.py`
- `content_authoring→classroom_core  backend/app/modules/content_authoring/api/routes/classroom_library.py → backend/app/modules/classroom_core/api/routes/classroom.py`
- `content_authoring→classroom_core  backend/app/modules/content_authoring/api/routes/classroom_library.py → backend/app/modules/classroom_core/orchestrator/classroom.py`
- `content_authoring→classroom_core  backend/app/modules/content_authoring/api/routes/classroom_library.py → backend/app/modules/classroom_core/services/classroom.py`
- `content_authoring→group_dialogue  backend/app/modules/content_authoring/api/routes/classroom_library.py → backend/app/services/ai_students.py`
- `orm-outside-repositories  backend/app/modules/content_authoring/api/routes/classroom_library.py`
- `route-imports-route  backend/app/modules/content_authoring/api/routes/classroom_library.py → backend/app/modules/classroom_core/api/routes/classroom.py`

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

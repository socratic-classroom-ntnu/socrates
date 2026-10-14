# AI Providers（後端）

使用者自備的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、identity_access

檔案範圍：
- `backend/app/modules/ai_providers/`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `ai_providers→classroom_core  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/classroom_core/api/routes/classroom.py`
- `ai_providers→classroom_core  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/classroom_core/orchestrator/classroom.py`
- `ai_providers→content_authoring  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/content_authoring/api/routes/classroom_library.py`
- `ai_providers→group_dialogue  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/group_dialogue/services/ai_students.py`
- `ai_providers→llm_runtime  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/llm_runtime/tutor/classroom_gateway.py`
- `orm-outside-repositories  backend/app/modules/ai_providers/api/routes/provider_profiles.py`
- `route-imports-route  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/classroom_core/api/routes/classroom.py`
- `route-imports-route  backend/app/modules/ai_providers/api/routes/provider_profiles.py → backend/app/modules/content_authoring/api/routes/classroom_library.py`

## 待清項（源頭修正，做完從這裡刪掉）

- api/routes/provider_profiles.py 866 行：ORM、金鑰加解密、路由鏈、稽核都在 route 檔，拆成 repositories／services／route。
<!-- module-map:end -->

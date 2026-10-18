# LLM Runtime（後端）

呼叫模型：prompt 組裝、各家 adapter、單人對話的導師介面、背景工作佇列。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、ai_providers

檔案範圍：
- `backend/app/modules/llm_runtime/`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `llm_runtime→classroom_core  backend/app/modules/llm_runtime/services/llm_workers.py → backend/app/modules/classroom_core/api/classroom_schemas.py`
- `llm_runtime→classroom_core  backend/app/modules/llm_runtime/services/llm_workers.py → backend/app/modules/classroom_core/orchestrator/classroom.py`
- `llm_runtime→classroom_core  backend/app/modules/llm_runtime/services/llm_workers.py → backend/app/modules/classroom_core/services/classroom.py`
- `llm_runtime→classroom_core  backend/app/modules/llm_runtime/tutor/classroom_gateway.py → backend/app/modules/classroom_core/orchestrator/classroom.py`
- `llm_runtime→classroom_core  backend/app/modules/llm_runtime/tutor/prompts.py → backend/app/modules/classroom_core/api/classroom_schemas.py`
- `llm_runtime→content_authoring  backend/app/modules/llm_runtime/tutor/gateway.py → backend/app/modules/content_authoring/domain/ladder.py`
- `llm_runtime→group_dialogue  backend/app/modules/llm_runtime/services/llm_workers.py → backend/app/modules/group_dialogue/services/ai_students.py`
- `llm_runtime→identity_access  backend/app/modules/llm_runtime/services/llm_workers.py → backend/app/modules/identity_access/services/email_delivery.py`
- `llm_runtime→solo_dialogue  backend/app/modules/llm_runtime/domain/tutor.py → backend/app/domain/types.py`

## 待清項（源頭修正，做完從這裡刪掉）

- services/llm_workers.py 直接 import ai_providers 的 route 檔：拆出 service 後改引用 service。
<!-- module-map:end -->

# Classroom Core（後端）

多人課堂的狀態機：大廳、倒數、作答、分佈、焦點討論、換題、總結。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、identity_access、ai_providers、llm_runtime、content_authoring、solo_dialogue

檔案範圍：
- `backend/app/orchestrator/classroom.py`
- `backend/app/orchestrator/classroom_policy.py`
- `backend/app/services/classroom.py`
- `backend/app/api/routes/classroom.py`
- `backend/app/api/classroom_schemas.py`
- `backend/app/domain/presence.py`

契約：
- Classroom OpenAPI → 前端型別（產生）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `classroom_core→group_dialogue  backend/app/api/routes/classroom.py → backend/app/api/routes/ai_students.py`
- `classroom_core→group_dialogue  backend/app/api/routes/classroom.py → backend/app/api/routes/groups.py`
- `classroom_core→group_dialogue  backend/app/orchestrator/classroom.py → backend/app/domain/group_run.py`
- `classroom_core→group_dialogue  backend/app/orchestrator/classroom.py → backend/app/services/ai_students.py`
- `classroom_core→group_dialogue  backend/app/services/classroom.py → backend/app/services/ai_students.py`
- `route-imports-route  backend/app/api/routes/classroom.py → backend/app/api/routes/ai_students.py`
- `route-imports-route  backend/app/api/routes/classroom.py → backend/app/api/routes/groups.py`
- `route-imports-route  backend/app/api/routes/classroom.py → backend/app/modules/ai_providers/api/routes/provider_profiles.py`
- `route-imports-route  backend/app/api/routes/classroom.py → backend/app/modules/content_authoring/api/routes/classroom_library.py`
- `route-imports-route  backend/app/api/routes/classroom.py → backend/app/modules/platform/api/routes/public_config.py`

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

# Group Dialogue（後端）

分組：分組設定、各組課堂、觀點確認與結算、AI 學生。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、identity_access、ai_providers、llm_runtime、content_authoring、classroom_core

檔案範圍：
- `backend/app/domain/group_run.py`
- `backend/app/api/routes/groups.py`
- `backend/app/services/ai_students.py`
- `backend/app/api/routes/ai_students.py`

契約：
- —

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `group_dialogue→analytics  backend/app/api/routes/groups.py → backend/app/domain/group_analysis.py`
- `orm-outside-repositories  backend/app/services/ai_students.py`
- `route-imports-route  backend/app/api/routes/ai_students.py → backend/app/api/routes/classroom.py`
- `route-imports-route  backend/app/api/routes/ai_students.py → backend/app/api/routes/groups.py`
- `route-imports-route  backend/app/api/routes/ai_students.py → backend/app/modules/ai_providers/api/routes/provider_profiles.py`
- `route-imports-route  backend/app/api/routes/groups.py → backend/app/api/routes/classroom.py`
- `route-imports-route  backend/app/api/routes/groups.py → backend/app/modules/ai_providers/api/routes/provider_profiles.py`
- `route-imports-route  backend/app/api/routes/groups.py → backend/app/modules/content_authoring/api/routes/classroom_library.py`

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

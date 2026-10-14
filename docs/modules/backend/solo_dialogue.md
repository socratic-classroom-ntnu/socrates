# Solo Dialogue（後端）

單人對話：學生與導師一對一走完階梯，含逐字稿、歷史紀錄與總結。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、llm_runtime、content_authoring

檔案範圍：
- `backend/app/orchestrator/orchestrator.py`
- `backend/app/orchestrator/policy.py`
- `backend/app/services/conversation.py`
- `backend/app/services/transcripts.py`
- `backend/app/services/history.py`
- `backend/app/services/room_view.py`
- `backend/app/repositories/session_repository.py`
- `backend/app/repositories/transcript_repository.py`
- `backend/app/repositories/history_repository.py`
- `backend/app/api/deps.py`
- `backend/app/api/schemas.py`
- `backend/app/api/transcript_schemas.py`
- `backend/app/api/history_schemas.py`
- `backend/app/api/room_schemas.py`
- `backend/app/api/routes/sessions.py`
- `backend/app/api/routes/messages.py`
- `backend/app/api/routes/transcripts.py`
- `backend/app/api/routes/summaries.py`
- `backend/app/api/routes/history.py`
- `backend/app/api/routes/room.py`
- `backend/app/models.py`
- `backend/app/interaction_models.py`
- `backend/app/domain/types.py`
- `backend/app/domain/session_state.py`

契約：
- 單人對話 OpenAPI → 前端型別（產生）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `orm-outside-repositories  backend/app/interaction_models.py`
- `orm-outside-repositories  backend/app/models.py`
- `solo_dialogue→app_shell  backend/app/api/deps.py → backend/app/main.py`
- `solo_dialogue→app_shell  backend/app/api/routes/history.py → backend/app/main.py`

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

# Solo Dialogue（單人對話，後端）

一對一 ladder 對話與對話室 view（/api/sessions/*；規格擱置：維持可跑、不加功能）。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：Portal-Goose
- 可依賴的模組：platform、llm-runtime、content-authoring

檔案範圍：
- `backend/app/orchestrator/orchestrator.py`
- `backend/app/orchestrator/policy.py`
- `backend/app/services/conversation.py`
- `backend/app/services/transcripts.py`
- `backend/app/services/history.py`
- `backend/app/repositories/session_repository.py`
- `backend/app/repositories/transcript_repository.py`
- `backend/app/repositories/history_repository.py`
- `backend/app/api/schemas.py`
- `backend/app/api/transcript_schemas.py`
- `backend/app/api/history_schemas.py`
- `backend/app/models.py`
- `backend/app/domain/types.py`
- `backend/app/domain/session_state.py`
- `backend/app/interaction_models.py`
- `backend/app/services/room_view.py`
- `backend/app/api/room_schemas.py`
- `backend/app/modules/solo_dialogue/`
- `backend/app/domain/tutor.py`
- `backend/app/tutor/gateway.py`
- `backend/app/tutor/provider.py`
- `backend/app/tutor/scripted.py`

契約：
- 單人對話（/api/sessions/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

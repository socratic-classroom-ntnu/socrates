# 後端模組

後端依功能分成模組，每個模組一個目錄 `backend/app/modules/<id>/`，模組內沿用原本的分層（`api/routes`、`services`、`domain`、`repositories`、`orchestrator`）。
跨模組只能 import `uses` 列出的模組；地圖與規則見 `modules.json`，檢查用 `python3 scripts/check_modules.py`（CI 與 pre-push 都會跑）。

- 新增檔案：放進它所屬模組的目錄；不確定屬於哪個模組時先在 PR 說明。
- 違規清單 `violations.json` 只能變短：修好一條就刪一條；`--update-baseline` 只在搬移模組的 PR 使用，並在 PR 說明列出數量變化。
- 下表由 `python3 scripts/check_modules.py --write` 產生，不要手改。

<!-- module-map:begin -->

✅＝可以直接交給一個人；⚠️＝能交，先清待清違規；❌＝先做源頭修正再交。

**後端模組**（架構與審查：Arthur；執行：Arthur；前端：前端組員）

| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |
|---|---|---|---|---|
| [App Shell](./backend/app_shell.md) | ✅ | `backend/app/main.py`<br>`backend/app/classroom_app.py`<br>`backend/app/classroom_server.py` | 全部（組裝層） | 0 |
| [Platform](./backend/platform.md) | ⚠️ | `backend/app/modules/platform/` | 不依賴其他模組 | 4 |
| [Identity & Access](./backend/identity_access.md) | ⚠️ | `backend/app/services/classroom_auth.py`<br>`backend/app/services/email_delivery.py` | platform | 3 |
| [AI Providers](./backend/ai_providers.md) | ⚠️ | `backend/app/api/routes/provider_profiles.py` | platform、identity_access | 8 |
| [LLM Runtime](./backend/llm_runtime.md) | ⚠️ | `backend/app/tutor/`<br>`backend/app/services/llm_workers.py`<br>`backend/app/domain/tutor.py` | platform、ai_providers | 9 |
| [Content Authoring](./backend/content_authoring.md) | ✅ | `backend/app/api/routes/classroom_library.py`<br>`backend/app/domain/library_decisions.py`<br>`backend/app/domain/ladder.py`<br>`backend/app/ladders/` | platform、identity_access、ai_providers、llm_runtime | 7 |
| [Classroom Core](./backend/classroom_core.md) | ✅ | `backend/app/orchestrator/classroom.py`<br>`backend/app/orchestrator/classroom_policy.py`<br>`backend/app/services/classroom.py`<br>`backend/app/api/routes/classroom.py`<br>`backend/app/api/classroom_schemas.py`<br>`backend/app/domain/presence.py` | platform、identity_access、ai_providers、llm_runtime、content_authoring、solo_dialogue | 10 |
| [Group Dialogue](./backend/group_dialogue.md) | ✅ | `backend/app/domain/group_run.py`<br>`backend/app/api/routes/groups.py`<br>`backend/app/services/ai_students.py`<br>`backend/app/api/routes/ai_students.py` | platform、identity_access、ai_providers、llm_runtime、content_authoring、classroom_core | 8 |
| [Analytics](./backend/analytics.md) | ✅ | `backend/app/domain/group_analysis.py` | platform、classroom_core、group_dialogue | 0 |
| [Solo Dialogue](./backend/solo_dialogue.md) | ✅ | `backend/app/orchestrator/orchestrator.py`<br>`backend/app/orchestrator/policy.py`<br>`backend/app/services/conversation.py`<br>`backend/app/services/transcripts.py`<br>`backend/app/services/history.py`<br>`backend/app/services/room_view.py`<br>`backend/app/repositories/session_repository.py`<br>`backend/app/repositories/transcript_repository.py`<br>`backend/app/repositories/history_repository.py`<br>`backend/app/api/deps.py`<br>`backend/app/api/schemas.py`<br>`backend/app/api/transcript_schemas.py`<br>`backend/app/api/history_schemas.py`<br>`backend/app/api/room_schemas.py`<br>`backend/app/api/routes/sessions.py`<br>`backend/app/api/routes/messages.py`<br>`backend/app/api/routes/transcripts.py`<br>`backend/app/api/routes/summaries.py`<br>`backend/app/api/routes/history.py`<br>`backend/app/api/routes/room.py`<br>`backend/app/models.py`<br>`backend/app/interaction_models.py`<br>`backend/app/domain/types.py`<br>`backend/app/domain/session_state.py` | platform、llm_runtime、content_authoring | 4 |

**契約（前後端唯一的接縫）**

| 契約 | 後端模組 | 前端使用處 | 來源 | 狀態 |
|---|---|---|---|---|
| Classroom OpenAPI → 前端型別 | classroom_core | frontend/src/api/classroomTypes.ts | scripts/gen_classroom_types.py → frontend/classroom-openapi.json | 產生 |
| 單人對話 OpenAPI → 前端型別 | solo_dialogue | frontend/src/api/types.ts | scripts/gen_types.sh | 產生 |

<!-- module-map:end -->

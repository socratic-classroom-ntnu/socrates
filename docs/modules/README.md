# Socratic 模組責任地圖

- 狀態：前後端各自模組化（Arthur 2026-10-13 15:18、23:48）：後端 10 個模組、前端 10 個模組，每個模組一位 default owner；兩端只透過下方「契約」接。版本以 git log 為準，本檔不記 commit
- 設計檔（Figma）：Figma:Project/Socratic.Socratic · Frontend（前端各模組的頁見各模組文件）；CE 端 Figma:Project/CoolEnglish.CoolEnglish · Frontend
- 範圍權威：`docs/modules/modules.json`；`python3 scripts/check_modules.py` 檢查每個原始碼檔屬於且只屬於一個模組、跨模組依賴只走 uses、route 不互相 import、ORM 只在 repositories、前端網路呼叫只在 api/；尚未清掉的違規逐條列在 `violations.json`，清單只能變短。`--write` 依地圖重寫下表與各模組文件的 Scope、待清違規、待清項
- 決策來源：Arthur 2026-10-13 15:18、15:31；PO-Goose C14 finale audit
- 劃分 PO：`PO-Goose`
- Backend domain owner：`Portal-Goose`
- Frontend implementation owner：`Portal-Heron`
- Visual owner：`Design-Goose`
- Product acceptance：`PO-Goose`

## 責任規則

1. 新模組先由劃分 PO 指定一位 default owner。
2. 各席位可修改其他模組；default owner review 後進入整合線。
3. Default owner在一個 Circuit 內完成review；該Circuit結束時由劃分 PO代審並留下receipt。
4. 跨模組改動由每個default owner審核自己的scope。
5. 分歧透過Thread交Arthur裁定。
6. Backend與Frontend各自模組化；兩端只透過generated contract、ViewModel、`available_actions`與reason codes連接。
7. Backend完成定義：API＋generated types＋DevConsole toy page＋acceptance cases。
8. Frontend只經集中client與generated types接線；正式畫面替換toy page時保持contract與fixtures。

## 模組地圖

<!-- module-map:begin -->

✅＝可以直接交給一個人；⚠️＝能交，先清待清違規；❌＝先做源頭修正再交。

**後端模組**（default owner：Portal-Goose）

| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |
|---|---|---|---|---|
| [App Shell](./backend/app-shell.md) | ✅ | `backend/app/main.py`<br>`backend/app/classroom_app.py`<br>`backend/app/classroom_server.py` | 全部（組裝層） | 0 |
| [Platform](./backend/platform.md) | ⚠️ | `backend/app/repositories/classroom_storage.py`<br>`backend/app/realtime.py`<br>`backend/app/db.py`<br>`backend/app/config.py`<br>`backend/app/classroom_env.py`<br>`backend/app/feature_flags.py`<br>`backend/app/api/deps.py`<br>`backend/app/api/model_base.py`<br>`backend/app/api/routes/public_config.py` | — | 10 |
| [Identity & Access](./backend/identity-access.md) | ⚠️ | `backend/app/services/classroom_auth.py`<br>`backend/app/services/email_delivery.py` | platform | 3 |
| [AI Providers](./backend/ai-providers.md) | ❌ | `backend/app/api/routes/provider_profiles.py` | platform、identity-access | 9 |
| [LLM Runtime](./backend/llm-runtime.md) | ⚠️ | `backend/app/tutor/`<br>`backend/app/services/llm_workers.py`<br>`backend/app/services/scenario_ai.py`<br>`backend/app/domain/tutor.py` | platform、ai-providers | 10 |
| [Content Authoring](./backend/content-authoring.md) | ❌ | `backend/app/api/routes/classroom_library.py`<br>`backend/app/api/routes/question_bank.py`<br>`backend/app/api/routes/script_assist.py`<br>`backend/app/domain/library_decisions.py`<br>`backend/app/domain/ladder.py`<br>`backend/app/ladders/` | platform、identity-access、ai-providers、llm-runtime | 17 |
| [Classroom Core](./backend/classroom-core.md) | ⚠️ | `backend/app/orchestrator/classroom.py`<br>`backend/app/orchestrator/classroom_policy.py`<br>`backend/app/services/classroom.py`<br>`backend/app/api/routes/classroom.py`<br>`backend/app/api/classroom_schemas.py`<br>`backend/app/domain/presence.py` | platform、identity-access、ai-providers、llm-runtime、content-authoring | 13 |
| [Group Dialogue](./backend/group-dialogue.md) | ⚠️ | `backend/app/domain/group_run.py`<br>`backend/app/api/routes/groups.py`<br>`backend/app/services/ai_students.py`<br>`backend/app/api/routes/ai_students.py` | platform、identity-access、ai-providers、llm-runtime、content-authoring、classroom-core | 8 |
| [Analytics](./backend/analytics.md) | ✅ | `backend/app/domain/group_analysis.py` | platform、classroom-core、group-dialogue | 0 |
| [Round 1](./backend/round1.md) | ✅ | `backend/app/orchestrator/orchestrator.py`<br>`backend/app/orchestrator/policy.py`<br>`backend/app/services/conversation.py`<br>`backend/app/services/transcripts.py`<br>`backend/app/services/history.py`<br>`backend/app/repositories/session_repository.py`<br>`backend/app/repositories/transcript_repository.py`<br>`backend/app/repositories/history_repository.py`<br>`backend/app/api/schemas.py`<br>`backend/app/api/transcript_schemas.py`<br>`backend/app/api/history_schemas.py`<br>`backend/app/api/routes/sessions.py`<br>`backend/app/api/routes/messages.py`<br>`backend/app/api/routes/transcripts.py`<br>`backend/app/api/routes/summaries.py`<br>`backend/app/api/routes/history.py`<br>`backend/app/models.py`<br>`backend/app/domain/types.py`<br>`backend/app/domain/session_state.py`<br>`backend/app/interaction_models.py`<br>`backend/app/api/routes/room.py`<br>`backend/app/services/room_view.py`<br>`backend/app/api/room_schemas.py` | platform、llm-runtime、content-authoring | 3 |

**前端模組**（default owner：Portal-Heron）

| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |
|---|---|---|---|---|
| [Shell](./frontend/shell.md) | ✅ | `frontend/src/App.tsx`<br>`frontend/src/main.tsx`<br>`frontend/src/ClassroomApp.tsx`<br>`frontend/src/teacherRoute.ts` | 全部（組裝層） | 0 |
| [Platform](./frontend/platform.md) | ✅ | `frontend/src/api/`<br>`frontend/src/components/`<br>`frontend/src/shared/phaseLabels.ts`<br>`frontend/src/shared/personalStatus.ts`<br>`frontend/src/features/dev-console/`<br>`frontend/src/identity.ts`<br>`frontend/src/testkit.ts`<br>`frontend/src/setupTests.ts`<br>`frontend/src/types/window-globals.d.ts` | — | 0 |
| [Media](./frontend/media.md) | ✅ | `frontend/src/features/avatar/`<br>`frontend/src/features/conversation-room/avatar/`<br>`frontend/src/features/conversation-room/voice/`<br>`frontend/src/shared/input/`<br>`frontend/src/types/speech-recognition.d.ts`<br>`frontend/src/types/talkinghead.d.ts` | platform | 0 |
| [Auth](./frontend/auth.md) | ✅ | `frontend/src/features/auth/` | platform | 0 |
| [AI Settings](./frontend/ai-settings.md) | ✅ | `frontend/src/features/ai-settings/` | platform | 0 |
| [Teacher Analytics](./frontend/teacher-analytics.md) | ⚠️ | `frontend/src/features/group-analytics/`<br>`frontend/src/features/teacher-records/` | platform | 0 |
| [Authoring](./frontend/authoring.md) | ✅ | `frontend/src/features/authoring/`<br>`frontend/src/features/script-builder/`<br>`frontend/src/features/question-bank/` | platform、ai-settings、teacher-analytics | 0 |
| [Group Dialogue](./frontend/group-dialogue.md) | ⚠️ | `frontend/src/features/group-dialogue/`<br>`frontend/src/features/personal-dialogue/`<br>`frontend/src/features/classroom-stage/` | platform、media、ai-settings、teacher-analytics | 0 |
| [Student Classroom](./frontend/student-classroom.md) | ✅ | `frontend/src/features/student-classroom/`<br>`frontend/src/features/research/` | platform、media、auth、ai-settings、group-dialogue、teacher-analytics | 0 |
| [Round 1](./frontend/round1.md) | ✅ | `frontend/src/features/round1/`<br>`frontend/src/features/conversation-room/` | platform、media | 0 |

**契約（兩端唯一的接縫）**

| 契約 | 後端模組 | 前端模組 | 來源 | 狀態 |
|---|---|---|---|---|
| 帳號（/auth/*） | identity-access | auth | classroom_schemas.py（Register、Login、ResetRequest…）→ api/types.ts | 產生型別 ✅；端點在 routes/classroom.py |
| 教室房間（/classrooms/*） | classroom-core | student-classroom | classroom_schemas.py、room_schemas.py → api/types.ts | 產生型別 ✅ |
| 分組課（/groups/*） | group-dialogue | group-dialogue、teacher-analytics | routes/groups.py | 缺 response_model，前端型別手寫（已寄契約請求） |
| AI 學生（/ai-students/*） | group-dialogue | group-dialogue | routes/ai_students.py | 部分手寫 |
| 雷達圖 | analytics | teacher-analytics | 待定 | 等契約（Design-Goose 1fba59189afd） |
| AI 供應商（/provider-profiles/*、/ai-settings/*） | ai-providers | ai-settings、authoring | routes/provider_profiles.py → api/types.ts | 產生型別 ✅ |
| 出題與題庫（/library/*、/question-bank/*、/script-assist/*） | content-authoring | authoring | 各 route 的 schema → api/types.ts | 產生型別 ✅ |
| Round 1（/api/sessions/*） | round1 | round1 | api/schemas.py、transcript_schemas.py → api/types.ts | 產生型別 ✅ |
| 公開設定（/public-config） | platform | platform | routes/public_config.py | ✅ |
| TTS（文字→音訊＋字時間點） | llm-runtime | media | 待定 | 等契約（已寄 Portal-Goose） |
| 人像模型清單（/avatar-packs/catalog.json） | platform | media | Portal avatar-serve 產生的靜態檔 → api/avatarCatalog.ts | ✅ |

<!-- module-map:end -->

## 唯一接縫

- Backend OpenAPI／schema是source authority。
- `frontend/src/api/types.ts`與`frontend/src/api/classroomTypes.ts`由generator產生。
- Frontend action只讀`available_actions`；原因文字只映射stable reason codes。
- Contract缺欄位時，Frontend送contract request給該Backend module owner。
- Toy page使用同一generated client與fixture，正式Frontend只替換presentation與interaction mapping。

## 交接封包

每個工作項使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)，並填入：module、default owner、writable files、review-required files、public contract、toy page、acceptance cases、compatibility、rollback與done definition。

## Compatibility治理

所有相容路徑登錄於[COMPATIBILITY-LEDGER.md](./COMPATIBILITY-LEDGER.md)，每筆具有owner、replacement、remove condition、checkpoint與tests。

## Source gates

- `scripts/check_modules.py`：模組覆蓋（每個檔一個模組）。
- `scripts/check_naming.sh`：已淘汰的舊名與開發回合編號（規則寫在腳本開頭）。

- Import cycle目標為0。
- Domain／orchestrator依賴application contract；API adapter依賴application service。
- 新增或修改的長函式以拆分為具名use case／policy／adapter為完成條件。
- 現有大檔採單調收斂：每次修改同步縮小責任面或產生明確抽取receipt。
- Generated types保持fresh。
- 每個Backend模組具toy page與acceptance cases。
- Source replacement、caller migration、generated artifacts與compatibility checkpoint共同進入terminal predicate。

## Rollout

1. Group Dialogue。
2. LLM Runtime。
3. Classroom Lifecycle。
4. Content Authoring。
5. Identity & Access。
6. Analytics。
7. Media Adapters。
8. Platform Adapters。

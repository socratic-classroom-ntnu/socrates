# Socratic 模組責任地圖

- 狀態：後端 10 個模組，架構、模組劃分與實作由 Arthur 負責；前端由前端組員負責；兩端只透過下方「契約」接。版本以 git log 為準，本檔不記 commit
- 範圍權威：`docs/modules/modules.json`；`python3 scripts/check_modules.py` 檢查每個後端原始碼檔屬於且只屬於一個模組、跨模組依賴只走 uses、route 不互相 import、ORM 只在 repositories；尚未清掉的違規逐條列在 `violations.json`，清單只能變短。`--write` 依地圖重寫下表與各模組文件的 Scope、待清違規、待清項
- 後端架構、模組劃分、實作與審查：Arthur
- 前端：前端組員
- 視覺設計：Arthur

## 責任規則

1. 新模組與模組劃分寫進 `modules.json`，由 Arthur 決定。
2. 後端改動經審查後進入 backend/arthur/main。
3. 源頭改動與呼叫端、`modules.json`、`violations.json`、模組文件在同一個 commit 更新；內部程式不留相容層。
4. 前後端分歧由 Arthur 與前端組員討論決定。
5. 前後端只透過 generated contract、ViewModel、`available_actions` 與 reason codes 連接；前端缺的資料寄契約請求到後端。
6. 後端模組完成定義：API＋generated types＋DevConsole toy page＋acceptance cases，`violations.json` 該模組條目清空。

## 模組地圖

<!-- module-map:begin -->

✅＝可以直接交給一個人；⚠️＝能交，先清待清違規；❌＝先做源頭修正再交。

**後端模組**（default owner：後端開發團隊）

| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |
|---|---|---|---|---|
| [App Shell](./backend/app-shell.md) | ⚠️ | `backend/app/main.py`<br>`backend/app/classroom_app.py`<br>`backend/app/classroom_server.py`<br>`backend/app/modules/app_shell/` | 全部（組裝層） | 0 |
| [Contract（對接）](./backend/contract.md) | ✅ | `backend/app/modules/contract/` | 全部（組裝層） | 0 |
| [Platform](./backend/platform.md) | ✅ | `backend/app/modules/platform/` | — | 0 |
| [Identity & Access](./backend/identity-access.md) | ⚠️ | `backend/app/modules/identity_access/` | platform | 0 |
| [AI Providers](./backend/ai-providers.md) | ⚠️ | `backend/app/modules/ai_providers/` | platform、identity-access | 0 |
| [LLM Runtime](./backend/llm-runtime.md) | ✅ | `backend/app/modules/llm_runtime/` | platform、ai-providers | 0 |
| [Content Authoring](./backend/content-authoring.md) | ⚠️ | `backend/app/modules/content_authoring/` | platform、identity-access、ai-providers、llm-runtime | 0 |
| [Classroom Core](./backend/classroom-core.md) | ⚠️ | `backend/app/modules/classroom_core/` | platform、identity-access、ai-providers、llm-runtime、content-authoring | 0 |
| [Group Dialogue](./backend/group-dialogue.md) | ⚠️ | `backend/app/modules/group_dialogue/` | platform、identity-access、ai-providers、llm-runtime、content-authoring、classroom-core | 0 |
| [Analytics](./backend/analytics.md) | ⚠️ | `backend/app/modules/analytics/` | platform、classroom-core、group-dialogue | 0 |
| [Solo Dialogue（單人對話）](./backend/solo-dialogue.md) | ✅ | `backend/app/modules/solo_dialogue/` | platform、llm-runtime、content-authoring | 0 |

**前端模組**（default owner：前端開發團隊）

| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |
|---|---|---|---|---|
| [Shell](./frontend/shell.md) | ✅ | `frontend/src/App.tsx`<br>`frontend/src/main.tsx`<br>`frontend/src/ClassroomApp.tsx`<br>`frontend/src/teacherRoute.ts` | 全部（組裝層） | 0 |
| [Contract（對接）](./frontend/contract.md) | ✅ | `frontend/src/contract/` | — | 0 |
| [Platform](./frontend/platform.md) | ✅ | `frontend/src/components/`<br>`frontend/src/shared/phaseLabels.ts`<br>`frontend/src/shared/personalStatus.ts`<br>`frontend/src/features/dev-console/`<br>`frontend/src/testkit.ts`<br>`frontend/src/setupTests.ts`<br>`frontend/src/types/window-globals.d.ts`<br>`frontend/src/vite-env.d.ts` | contract | 0 |
| [Media](./frontend/media.md) | ✅ | `frontend/src/features/avatar/`<br>`frontend/src/features/conversation-room/avatar/`<br>`frontend/src/features/conversation-room/voice/`<br>`frontend/src/shared/input/`<br>`frontend/src/types/speech-recognition.d.ts`<br>`frontend/src/types/talkinghead.d.ts` | platform、contract | 0 |
| [Auth](./frontend/auth.md) | ✅ | `frontend/src/features/auth/`<br>`frontend/src/features/entrance/`<br>`frontend/src/entryRole.ts` | platform、contract | 0 |
| [AI Settings](./frontend/ai-settings.md) | ✅ | `frontend/src/features/ai-settings/` | platform、contract | 0 |
| [Teacher Analytics](./frontend/teacher-analytics.md) | ⚠️ | `frontend/src/features/group-analytics/`<br>`frontend/src/features/teacher-records/` | platform、contract | 0 |
| [Authoring](./frontend/authoring.md) | ✅ | `frontend/src/features/authoring/`<br>`frontend/src/features/script-builder/`<br>`frontend/src/features/question-bank/` | platform、ai-settings、teacher-analytics、contract | 0 |
| [Group Dialogue](./frontend/group-dialogue.md) | ⚠️ | `frontend/src/features/group-dialogue/`<br>`frontend/src/features/personal-dialogue/`<br>`frontend/src/features/classroom-stage/` | platform、media、ai-settings、teacher-analytics、contract | 0 |
| [Student Classroom](./frontend/student-classroom.md) | ✅ | `frontend/src/features/student-classroom/`<br>`frontend/src/features/research/`<br>`frontend/src/features/classroom-answer/`<br>`frontend/src/features/danmaku/` | platform、media、auth、ai-settings、group-dialogue、teacher-analytics、contract | 0 |
| [單人對話](./frontend/solo-dialogue.md) | ✅ | `frontend/src/features/round1/`<br>`frontend/src/features/conversation-room/` | platform、media、contract | 0 |

**契約（兩端唯一的接縫）**

| 契約 | 後端模組 | 前端模組 | 來源 | 狀態 |
|---|---|---|---|---|
| 帳號（/auth/*） | identity-access | auth | classroom_schemas.py（Register、Login、ResetRequest…）→ api/types.ts | 產生型別 ✅；端點在 routes/classroom.py |
| 教室房間（/classrooms/*） | classroom-core | student-classroom | classroom_schemas.py、room_schemas.py → api/types.ts | 產生型別 ✅ |
| 分組課（/groups/*） | group-dialogue | group-dialogue、teacher-analytics | routes/groups.py | 缺 response_model，前端型別手寫（已寄契約請求） |
| AI 學生（/ai-students/*） | group-dialogue | group-dialogue | routes/ai_students.py | 部分手寫 |
| 雷達圖 | analytics | teacher-analytics | 待定 | 等契約（設計稿） |
| AI 供應商（/provider-profiles/*、/ai-settings/*） | ai-providers | ai-settings、authoring | routes/provider_profiles.py → api/types.ts | 產生型別 ✅ |
| 出題與題庫（/library/*、/question-bank/*、/script-assist/*） | content-authoring | authoring | 各 route 的 schema → api/types.ts | 產生型別 ✅ |
| 單人對話（/api/sessions/*） | solo-dialogue |  | api/schemas.py、transcript_schemas.py → api/types.ts | 產生型別 ✅ |
| 公開設定（/public-config） | platform | platform | routes/public_config.py | ✅ |
| TTS（文字→音訊＋字時間點） | llm-runtime | media | 待定 | 等契約 |
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
- 現有大檔採單調收斂：每次修改同步縮小責任面或抽出明確的子模組。
- Generated types保持fresh。
- 每個Backend模組具toy page與acceptance cases。
- 源頭替換、呼叫端遷移、generated artifacts 與相容帳冊在同一個 commit 完成。

## 拆分順序

每批一個模組；該模組在 `violations.json` 的條目清空才進下一批。

1. group-dialogue
2. llm-runtime
3. classroom-core
4. content-authoring
5. identity-access
6. analytics
7. ai-providers
8. platform
9. solo-dialogue
10. app-shell（組裝層，最後收斂）

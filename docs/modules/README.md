# Socratic 模組責任地圖

- 狀態：八模組與歸屬由 PO-Goose 副署（2026-10-13）；Arthur 核定見 WB CIR-PORTAL-01-G1。版本以 git log 為準，本檔不記 commit
- 設計檔（Figma）：「Socratic · Frontend」一模組一頁（頁名同本表模組，前綴 01–08）；CE 端「CoolEnglish · Frontend」
- 範圍權威：`docs/modules/modules.json`；`python3 scripts/check_modules.py` 檢查每個原始碼檔屬於且只屬於一個模組，`--write` 依它重寫下表與各模組文件的 Scope、待清項
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
✅＝可以直接交給一個人；⚠️＝能交，先看「待清項」；❌＝先做源頭修正再交（否則兩個人會改到同一塊）。

| 模組 | 邊界 | 後端（default owner：Portal-Goose） | 前端（default owner：Portal-Heron） | 先清的項目 |
|---|---|---|---|---|
| [Classroom Lifecycle](./classroom-lifecycle.md) | ⚠️ | `backend/app/orchestrator/classroom.py`<br>`backend/app/orchestrator/classroom_policy.py`<br>`backend/app/services/classroom.py`<br>`backend/app/api/routes/classroom.py`<br>`backend/app/api/classroom_schemas.py`<br>`backend/app/api/room_schemas.py`<br>`backend/app/services/room_view.py`<br>`backend/app/orchestrator/orchestrator.py`<br>`backend/app/orchestrator/policy.py`<br>`backend/app/services/conversation.py`<br>`backend/app/services/transcripts.py`<br>`backend/app/services/history.py`<br>`backend/app/repositories/session_repository.py`<br>`backend/app/repositories/transcript_repository.py`<br>`backend/app/repositories/history_repository.py`<br>`backend/app/api/schemas.py`<br>`backend/app/api/transcript_schemas.py`<br>`backend/app/api/history_schemas.py`<br>`backend/app/api/routes/sessions.py`<br>`backend/app/api/routes/messages.py`<br>`backend/app/api/routes/transcripts.py`<br>`backend/app/api/routes/summaries.py`<br>`backend/app/api/routes/history.py`<br>`backend/app/api/routes/room.py`<br>`backend/app/domain/session_state.py`<br>`backend/app/domain/presence.py`<br>`backend/app/domain/tutor.py`<br>`backend/app/domain/types.py`<br>`backend/app/models.py`<br>`backend/app/interaction_models.py` | `frontend/src/ClassroomApp.tsx`<br>`frontend/src/Round1App.tsx`<br>`frontend/src/round1Routes.ts`<br>`frontend/src/teacherRoute.ts`<br>`frontend/src/pages/Conversation.tsx`<br>`frontend/src/pages/Home.tsx`<br>`frontend/src/pages/History.tsx`<br>`frontend/src/pages/Summary.tsx`<br>`frontend/src/pages/TeacherDashboard.tsx`<br>`frontend/src/features/conversation-room/`<br>`frontend/src/features/research/`<br>`frontend/src/components/`<br>`frontend/src/shared/phaseLabels.ts` | classroom_schemas.py 是所有模組共用的契約檔（約 400 行）：依模組拆成各自的 schemas，改欄位時才不會跨 owner。 |
| [Group Dialogue](./group-dialogue.md) | ⚠️ | `backend/app/domain/group_run.py`<br>`backend/app/api/routes/groups.py`<br>`backend/app/services/ai_students.py`<br>`backend/app/api/routes/ai_students.py` | `frontend/src/pages/GroupClassroom.tsx`<br>`frontend/src/features/personal-dialogue/`<br>`frontend/src/features/classroom-stage/` | group_run.extend() 單一函式約 450 行，GameOrchestrator 被動態包兩次（_extend_group_run、_extend_ai_students）：改成 composition。 |
| [Analytics](./analytics.md) | ⚠️ | `backend/app/domain/group_analysis.py` | `frontend/src/features/group-analytics/`<br>`frontend/src/features/teacher-records/` | teacher-records 的型別手寫（等 Group Dialogue 的分組 view response_model）。 |
| [LLM Runtime](./llm-runtime.md) | ❌ | `backend/app/tutor/`<br>`backend/app/services/llm_workers.py`<br>`backend/app/services/scenario_ai.py`<br>`backend/app/api/routes/provider_profiles.py` | `frontend/src/pages/ProviderSettings.tsx`<br>`frontend/src/features/ai-settings/` | routes/provider_profiles.py 954 行：ORM（ProviderProfile、SessionProviderSecret、AccountAISettings）、金鑰加解密、provider 路由鏈、呼叫稽核全在 route 檔。拆成 repositories（ORM）＋services/providers（加解密、路由鏈、稽核）＋route（只有 HTTP）。 |
| [Content Authoring](./content-authoring.md) | ❌ | `backend/app/api/routes/classroom_library.py`<br>`backend/app/api/routes/question_bank.py`<br>`backend/app/api/routes/script_assist.py`<br>`backend/app/domain/library_decisions.py`<br>`backend/app/domain/ladder.py`<br>`backend/app/ladders/` | `frontend/src/features/script-builder/`<br>`frontend/src/features/question-bank/`<br>`frontend/src/pages/QuestionBank.tsx`<br>`frontend/src/pages/ClassroomLibrary.tsx` | routes/classroom_library.py 定義 ORM（ClassroomAssets、SessionLink、LibraryReceipt）：移到 repositories。 |
| [Identity & Access](./identity-access.md) | ⚠️ | `backend/app/services/classroom_auth.py`<br>`backend/app/services/email_delivery.py` | `frontend/src/pages/VerificationGate.tsx`<br>`frontend/src/identity.ts` | /auth/* 端點目前寫在 routes/classroom.py：抽成 routes/auth.py。 |
| [Media Adapters](./media-adapters.md) | ✅ | — | `frontend/src/features/avatar/`<br>`frontend/src/features/conversation-room/avatar/`<br>`frontend/src/features/conversation-room/voice/`<br>`frontend/src/shared/input/`<br>`frontend/src/types/speech-recognition.d.ts`<br>`frontend/src/types/talkinghead.d.ts` | TTS／STT 後端契約（Portal-Goose）：TTS 回音訊＋字的時間點，人像改用音訊時間軸。 |
| [Platform Adapters](./platform-adapters.md) | ⚠️ | `backend/app/repositories/classroom_storage.py`<br>`backend/app/realtime.py`<br>`backend/app/db.py`<br>`backend/app/config.py`<br>`backend/app/main.py`<br>`backend/app/classroom_app.py`<br>`backend/app/classroom_server.py`<br>`backend/app/classroom_env.py`<br>`backend/app/feature_flags.py`<br>`backend/app/api/deps.py`<br>`backend/app/api/model_base.py`<br>`backend/app/api/routes/public_config.py` | `frontend/src/api/`<br>`frontend/src/features/dev-console/`<br>`frontend/src/App.tsx`<br>`frontend/src/main.tsx`<br>`frontend/src/testkit.ts`<br>`frontend/src/setupTests.ts`<br>`frontend/src/types/window-globals.d.ts` | repositories/classroom_storage.py 為了建表 import routes（classroom_library、provider_profiles、question_bank）：ORM 歸位後刪掉這段。 |
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

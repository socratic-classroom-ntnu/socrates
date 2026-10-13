# Classroom Lifecycle

## Purpose

教室、成員、題目執行、phase、command、event 與 ViewModel 的生命週期。

## Ownership

| Role | Seat |
|---|---|
| Backend default owner | `Portal-Goose` |
| Frontend default implementation owner | `Portal-Heron` |
| Visual owner | `Design-Goose` |
| Partitioning／acceptance PO | `PO-Goose` |

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

後端（default owner：Portal-Goose）：
- `backend/app/orchestrator/classroom.py`
- `backend/app/orchestrator/classroom_policy.py`
- `backend/app/services/classroom.py`
- `backend/app/api/routes/classroom.py`
- `backend/app/api/classroom_schemas.py`
- `backend/app/api/room_schemas.py`
- `backend/app/services/room_view.py`
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
- `backend/app/api/routes/sessions.py`
- `backend/app/api/routes/messages.py`
- `backend/app/api/routes/transcripts.py`
- `backend/app/api/routes/summaries.py`
- `backend/app/api/routes/history.py`
- `backend/app/api/routes/room.py`
- `backend/app/domain/session_state.py`
- `backend/app/domain/presence.py`
- `backend/app/domain/tutor.py`
- `backend/app/domain/types.py`
- `backend/app/models.py`
- `backend/app/interaction_models.py`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/ClassroomApp.tsx`
- `frontend/src/Round1App.tsx`
- `frontend/src/round1Routes.ts`
- `frontend/src/teacherRoute.ts`
- `frontend/src/pages/Conversation.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/History.tsx`
- `frontend/src/pages/Summary.tsx`
- `frontend/src/pages/TeacherDashboard.tsx`
- `frontend/src/features/conversation-room/`
- `frontend/src/features/research/`
- `frontend/src/components/`
- `frontend/src/shared/phaseLabels.ts`

## 待清項（源頭修正，做完從這裡刪掉）

- classroom_schemas.py 是所有模組共用的契約檔（約 400 行）：依模組拆成各自的 schemas，改欄位時才不會跨 owner。
- routes/classroom.py 內的 /auth/* 端點移到 Identity & Access。
- frontend ClassroomApp.tsx 把路由、登入、學生首頁、Round 2 課堂擠在一個檔：拆成路由表＋各模組頁面。
- Round 1（/api/sessions、ladder 對話）規格已標示擱置：維持可跑、不加功能。
<!-- module-map:end -->

## Public contract

- Room/Classroom ViewModel
- available_actions
- unavailable_actions / reason codes
- phase/event projection

## Toy page

本模組使用既有`frontend/src/features/dev-console/`註冊fixture與操作面板。Toy page與production frontend共用generated client、ViewModel與reason codes。

## Acceptance package

- API contract與generated types同步。
- Toy page完成happy path、typed error、permission、retry／idempotency與boundary fixtures。
- Backend module tests與Frontend adapter tests各自通過。
- Default owner review receipt成立。
- Compatibility ledger同步更新。
- Source、caller、generated artifacts與handoff文件形成同一successor。

## First metabolism

1. 把 HTTP DTO 與 domain/application contract 分開。
2. 把 GameOrchestrator composition 收斂成明確 constructor 與 ports。
3. 建立 DevConsole toy flow：建立教室、進入 phase、送 command、讀 event。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

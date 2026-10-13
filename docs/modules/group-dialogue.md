# Group Dialogue

## Purpose

分組作答、個人追問、代表討論、觀點確認、final reflection 與 settlement。

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
- `backend/app/domain/group_run.py`
- `backend/app/api/routes/groups.py`
- `backend/app/services/ai_students.py`
- `backend/app/api/routes/ai_students.py`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/pages/GroupClassroom.tsx`
- `frontend/src/features/personal-dialogue/`
- `frontend/src/features/classroom-stage/`

## 待清項（源頭修正，做完從這裡刪掉）

- group_run.extend() 單一函式約 450 行，GameOrchestrator 被動態包兩次（_extend_group_run、_extend_ai_students）：改成 composition。
- 分組 view 沒有 response_model：前端 GroupStance、PersonalDialogue、TeacherRecords 只能手寫型別（契約請求）。
- services/ai_students.py 定義 ORM（AIStudentProfile）：移到 repositories。
- routes/ai_students.py import routes/groups：共用部分下移到 service。
- routes/groups.py 606 行，流程邏輯下移到 service。
<!-- module-map:end -->

## Public contract

- GroupRunView
- personal dialogue projection
- group commands
- settlement and confirmation receipts

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

1. 把 group evidence、personal dialogue、confirmation、settlement、projection 拆成明確 components。
2. 以 explicit composition 取代 extend() 與 class reassignment。
3. 建立 toy page：單一 group run 可完整跑回答、個人追問、確認、settlement。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

# Identity & Access

## Purpose

帳號、登入 session、membership、Email 驗證、重設與授權。

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
- `backend/app/services/classroom_auth.py`
- `backend/app/services/email_delivery.py`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/pages/VerificationGate.tsx`
- `frontend/src/identity.ts`

## 待清項（源頭修正，做完從這裡刪掉）

- /auth/* 端點目前寫在 routes/classroom.py：抽成 routes/auth.py。
- services/email_delivery.py 定義 ORM（MailDelivery）：移到 repositories。
- frontend 登入／註冊表單（Auth）寫在 ClassroomApp.tsx：抽成本模組的頁面。
<!-- module-map:end -->

## Public contract

- Account/session view
- membership and role projection
- verification delivery status
- stable auth reason codes

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

1. 將 auth endpoints 從 classroom route 抽成專屬 adapter。
2. 建立 toy page：register、verify、login、role、logout。
3. 授權矩陣與跨帳號拒絕案例形成獨立 acceptance suite。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

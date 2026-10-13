# Identity & Access（後端）

## Purpose

帳號、登入 session、membership、Email 驗證、重設與授權。

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
- 審查通過。
- Compatibility ledger同步更新。
- 源頭、呼叫端、generated artifacts與交接文件在同一個commit更新。

## 第一批工作

1. 將 auth endpoints 從 classroom route 抽成專屬 adapter。
2. 建立 toy page：register、verify、login、role、logout。
3. 授權矩陣與跨帳號拒絕案例形成獨立 acceptance suite。

## Scope rules

- 本模組範圍內的變更經審查後合併。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：Portal-Goose
- 可依賴的模組：platform

檔案範圍：
- `backend/app/services/classroom_auth.py`
- `backend/app/services/email_delivery.py`
- `backend/app/modules/identity_access/`

契約：
- 帳號（/auth/*）（產生型別 ✅；端點在 routes/classroom.py）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- /auth/* 端點目前寫在 routes/classroom.py：抽成 routes/auth.py。
- services/email_delivery.py 定義 ORM（MailDelivery）：移到 repositories。
<!-- module-map:end -->

# Identity & Access（後端）

## Purpose

帳號、登入 session、membership、Email 驗證、重設與授權。

## Public contract

- Account/session view
- membership and role projection
- verification delivery status
- stable auth reason codes

### 訪客（免註冊加入）

- `POST /auth/guest`（暱稱＋語言）建訪客帳號與 session；`POST /auth/guest/upgrade`（email＋密碼）讓同一個帳號 id 轉成註冊帳號，和一般註冊一樣要先驗證 Email。
- 訪客只靠裝置上的 session cookie 定位。每個允許訪客的請求都把 `guest_expires_at` 延到 7 天後；過了就回 `GUEST_EXPIRED`。
- **預設拒絕訪客**：`service.account(...)` 遇到訪客回 `GUEST_NOT_ALLOWED`，學生端點要明確傳 `allow_guest=True`（例：選課、單人活動、分組課）。老師與金鑰相關的端點不傳，訪客就進不去。

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
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform

檔案範圍：
- `backend/app/modules/identity_access/`

契約：
- 帳號（/auth/*）（產生型別 ✅；端點在 routes/classroom.py）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

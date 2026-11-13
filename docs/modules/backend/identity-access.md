# Identity & Access（後端）

## Purpose

帳號、登入 session、membership、Email 驗證、重設與授權。

## Public contract

- Account/session view
- membership and role projection
- verification delivery status
- stable auth reason codes

### 訪客（免註冊加入）

- `POST /auth/guest`（暱稱＋語言）建訪客帳號與 session；`POST /auth/guest/upgrade`（使用者名稱＋email＋密碼，規則與一般註冊相同）讓同一個帳號 id 轉成註冊帳號，和一般註冊一樣要先驗證 Email；被已驗證帳號佔用時回 `USERNAME_TAKEN`／`EMAIL_TAKEN`。
- 訪客只靠裝置上的 session cookie 定位。`guest_expires_at` 固定是加入那一刻 + 168 小時，有動作也不延長；過了就回 `GUEST_EXPIRED`。`kind` 是 `registered`／`guest`／`expired_guest`（到期後由排程標記，帳號與紀錄保留）。訪客登出只讓 session 失效，不動到期時間與名字。
- **預設拒絕訪客**：`service.account(...)` 遇到訪客回 `GUEST_NOT_ALLOWED`，學生端點要明確傳 `allow_guest=True`（例：選課、單人活動、分組課）。老師與金鑰相關的端點不傳，訪客就進不去。
- **訪客紀錄 hook**（`contracts.GuestRecordHook`）：每個存學生紀錄的模組提供 `reassign(db, guest_id, account_id)` 與 `forget_name(db, guest_id)`，由 app-shell 用 `service.register_guest_hook(模組名, hook)` 註冊。兩個都在呼叫端的交易裡執行、不自己 commit。`reassign` 遇到同一課／同一活動兩邊都有紀錄時，以帳號那份為準，訪客那份刪掉。`forget_name` 清掉模組存的訪客名字（直接清，不軟刪），紀錄保留。這一輪只有 course-management、solo-activity 要提供（分組課不開放訪客）。
- **登入時併入訪客紀錄**：`POST /auth/login` 時裝置上還有沒到期的訪客 session，就在同一個交易裡呼叫每個 hook 的 `reassign(訪客, 帳號)`，再讓訪客 session 失效；訪客帳號留著，照到期時間由排程處理。有 session cookie 時登入要通過同源檢查（cookie 本身也是 SameSite=Lax），別的網站不能替裝置登入、把訪客紀錄搬走。某個 hook 失敗時整個併入回滾（savepoint）、記 log，登入照常成功。註冊升級沿用同一個 id，不走這條；老師帳號不能併入這輪不做。
- **訪客到期**：`service.expire_guests()` 給 app-shell 排成每日工作。`guest_expires_at` 已過的訪客逐一處理（一人一個交易）：呼叫每個 hook 的 `forget_name`，帳號的使用者名稱換成 `expired-guest-<id>`，session 全部失效，`kind` 改成 `expired_guest`；帳號那一列、作答與對話都保留。某個 hook 失敗時，那位訪客留到下一次，不影響其他人；期間已註冊（含還沒驗證 Email）的帳號不受影響。

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

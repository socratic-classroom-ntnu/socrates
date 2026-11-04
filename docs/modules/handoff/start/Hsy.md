# 交接包：Hsy（A 包：課堂）

分支：`backend/Hsy/main`｜PR 目標：`backend/main`｜交接文件：[A-classroom.md](../A-classroom.md)

## 第一天
1. 讀 [README.md](../README.md) 的「第一次拿到這份文件」，把專案跑起來，並確認測試全綠。
2. 讀你這包的交接文件：[A-classroom.md](../A-classroom.md)。
3. 讀 `docs/classroom/NEW-FEATURES.md`（A 包的新功能排在第二版，先看第 1、2 節了解整體）。
4. 在團隊 Discord 回報你的第一個 PR 要做什麼。

## 你的第一個 PR
classroom-core 的 HTTP 層測試：用 TestClient 打真的路由，讀回 200 與欄位。要涵蓋的端點有：
- `POST /api/v2/classrooms/{room_id}/reactions`
- `POST /api/v2/classrooms/{room_id}/budget`
- `GET /api/v2/classrooms/{room_id}/events`
- `POST /api/v2/scripts/{script_id}/adopt-question/{room_id}/{index}`

一個 PR 只動一個模組。

## 你這包的工作（細節見 A-classroom.md）
- group-dialogue 的 HTTP 層測試（4 個端點）。
- analytics 的 `GET /api/v2/groups/classrooms/{rid}/analysis` 補上 response_model。
- 第二版：分組課個人追問套用同一組 10 個旗標；分組課的教師分析沿用單人活動的指標與雷達契約。

## 流程
1. 從 `backend/Hsy/main` 開始，這條分支是從 `backend/main` 開出來的。`backend/Hsy/` 底下可以自由開分支（例如 `backend/Hsy/<主題>`），把 `backend/Hsy/main` 當成根。
2. 做完一個功能，就從 `backend/Hsy/` 底下的分支開 PR 到 `backend/main`。Arthur 審完後合進 backend/main，再以功能為單位打包成 PR 給 `develop`。
3. `backend/main` 有新東西時，先 merge 進自己的分支再繼續做。
4. 送 PR 前跑交接文件裡「送 PR 前的檢查」那幾行。

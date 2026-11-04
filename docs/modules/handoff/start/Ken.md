# 交接包：Ken（B 包：課程、單人活動與底層）

分支：`backend/Ken/main`｜PR 目標：`backend/main`｜交接文件：[B-authoring-solo-base.md](../B-authoring-solo-base.md)

## 第一天
1. 讀 [README.md](../README.md) 的「第一次拿到這份文件」，把專案跑起來，並確認測試全綠。
2. 讀你這包的交接文件：[B-authoring-solo-base.md](../B-authoring-solo-base.md)。
3. 讀 `docs/classroom/NEW-FEATURES.md`（第 3 節互動、第 4 節 API）、`docs/classroom/PROMPT-DESIGN.md`。
4. 在團隊 Discord 回報你的第一個 PR 要做什麼。

## 你的第一個 PR
course-management 的敘述型活動：活動內容改成「敘述＋立場空間」，加 `POST`／`PUT /activities/{id}/expansion`，發布時把立場空間鎖進 ActivityRevision；用 migration 把舊的選項轉成立場空間。

這一項要接 C 包的 `ActivityExpansion` 型別。型別還沒合進 backend/main 之前，先依 NEW-FEATURES 的欄位寫測試和 migration。

## 你這包的工作（細節見 B-authoring-solo-base.md）
1. course-management：敘述型活動（上面那一項）。
2. solo-activity：拿掉選項流程，改成自由文字表態，接 stance_classify；每則訊息存 locale。
3. course-management：「允許免註冊」設定、QR 連結、訪客選課（等 C 包的訪客帳號）。
4. solo-activity：每則訊息存 flags；指標寫成純函式；教師 progress 帶指標、趨勢、標記。
5. solo-activity：統整引用的存放，view 回傳原句位置。
6. solo-activity：最終統整與確認迴圈；雷達（PCA、百分位、`GET /solo/activities/{id}/radar`）。
7. 舊單人對話的資料表已經搬到 `legacy_solo_dialogue` schema（migration 0017，issue #71）。要不要把舊資料帶進單人活動，等決定後再排。

## 流程
1. 從 `backend/Ken/main` 開始，這條分支是從 `backend/main` 開出來的。`backend/Ken/` 底下可以自由開分支（例如 `backend/Ken/<主題>`），把 `backend/Ken/main` 當成根。
2. 做完一個功能，就從 `backend/Ken/` 底下的分支開 PR 到 `backend/main`。Arthur 審完後合進 backend/main，再以功能為單位打包成 PR 給 `develop`。
3. `backend/main` 有新東西時，先 merge 進自己的分支再繼續做。
4. 送 PR 前跑交接文件裡「送 PR 前的檢查」那幾行。

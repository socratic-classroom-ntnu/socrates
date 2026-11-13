# B 包：課程、單人活動與底層

模組：course-management、solo-activity、content-authoring、platform、app-shell（後端）。負責人：Ken

## 起點
- 分支：`backend/Ken/main`（已經建好）。為你訂製的交接包在 `docs/modules/handoff/Ken/`：README 與 TASKS。做完 TASKS 裡的一項就 PR 到 `backend/main`。
- 先讀：[README.md](README.md) 的「第一次拿到這份文件」；本包每個模組的 `docs/modules/backend/<模組>.md`；`docs/classroom/NEW-FEATURES.md`、`docs/classroom/PROMPT-DESIGN.md`。

## 範圍與現有待辦

### Course Management（`course-management`）
- 做什麼：課程 → 活動 → 題目：開課、選課（課程代碼）、活動編輯與開放時間。
- 可寫的檔案：`backend/app/modules/course_management/`
- 依賴：platform、identity-access。這一輪要新增 llm-runtime、ai-providers，modules.json 在同一個 PR 改，請 C 包負責人審。

### Solo Activity（`solo-activity`）
- 做什麼：學生在課程活動裡和蘇格拉底導師一對一對話，包含確認統整、改變立場、進度，以及給教師的統計。
- 可寫的檔案：`backend/app/modules/solo_activity/`
- 依賴：platform、identity-access、course-management、ai-providers、llm-runtime
- 現況：學生確認最後一題後按「送出回顧」，作答直接進入 `completed`（過渡做法）。這一輪由「最終統整」取代。

### Content Authoring（`content-authoring`）
- 做什麼：劇本與題目（`/scripts`）、題庫、AI 協助出題。
- 可寫的檔案：`backend/app/modules/content_authoring/`
- 依賴：platform、identity-access、ai-providers、llm-runtime
- 現有待辦：5 個端點還沒有 response_model，清單在 `RESPONSE_MODEL_PENDING`。

### Platform（`platform`）
- 做什麼：資料庫、設定、交易邊界、共用的 HTTP 依賴與 model 基底。不依賴任何業務模組。
- 可寫的檔案：`backend/app/modules/platform/`
- 現有待辦：相容帳冊（`COMPATIBILITY-LEDGER.md`）裡的舊環境變數別名。

### App Shell（`app-shell`）
- 做什麼：組裝層。建 FastAPI app、掛上各模組的 router、註冊 ORM 與跨模組 hook、跑背景工作。
- 可寫的檔案：`backend/app/main.py`、`backend/app/classroom_app.py`、`backend/app/classroom_server.py`、`backend/app/modules/app_shell/`
- 現有待辦：`GET /api/v2/readiness` 還沒有 response_model。

## 新功能工作

| 順序 | 模組 | 功能 | 做什麼 | 等誰 |
|---|---|---|---|---|
| 1 | course-management | 敘述型活動 | 活動內容改成「敘述＋立場空間」。`POST`／`PUT /activities/{id}/expansion`；發布時鎖進 ActivityRevision；用 migration 把舊的選項轉成立場空間 | C 包的 ActivityExpansion 型別 |
| 2 | solo-activity | 敘述型活動、多語 | 拿掉選項流程，改成學生自由文字表態，再用 stance_classify 歸類；「我其實改變想法了」改成重新歸類；每則訊息存 locale | C 包的 StanceClassification、SoloTutorTurn |
| 3 | course-management | 免註冊加入 | 課程設定加「允許免註冊」；QR 連結；訪客可以選課；`GET /course-join/{code}` 回傳 `allow_guest` | C 包訪客帳號的 migration |
| 4 | solo-activity | 旗標與學生指標 | 每則訊息存 flags；指標寫成一個純函式檔；`GET /solo/activities/{id}/progress` 帶出指標、趨勢、標記，並即時更新 | C 包的 flags |
| 5 | solo-activity | 統整引用 | 存放引用，view 回傳 message id 與 quote 的起訖位置 | C 包的引用驗證 |
| 6 | solo-activity | 統整與雷達 | 最終統整與確認迴圈：取代 submit_review，連續兩次「不太對」就標記「未確認」並結束；PCA、百分位、`GET /solo/activities/{id}/radar` | C 包的 `embed()`、final_summary、radar_* |
| 7 | app-shell | 免註冊加入 | 註冊 identity-access 提供的閒置訪客刪除排程（每日一次）與各模組的訪客紀錄 hook | C 包的 hook 契約 |
| 7a | course-management、solo-activity | 免註冊加入 | 實作訪客紀錄 hook：選課與單人作答的 `reassign`、`delete` | C 包的 hook 契約 |

## 規則與檢查
和 A、C、D 包相同，見各包文件的「規則」與「送 PR 前的檢查」兩節。

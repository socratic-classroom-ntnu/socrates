# Ken 的工作清單（B 包：課程、單人活動與底層）

## 你的第一個 PR
course-management 的敘述型活動：活動內容改成「敘述＋立場空間」，加 `POST`／`PUT /activities/{id}/expansion`，發布時把立場空間鎖進 ActivityRevision；用 migration 把舊的選項轉成立場空間。同一個 PR 改 `modules.json`（新增依賴 llm-runtime、ai-providers），請 Courecta 審。

## 全部工作（照順序做；「—」是不綁新功能的現有待辦，有空檔就做）
| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 1 | course-management | 敘述型活動 | 上面的第一個 PR | Courecta 的 ActivityExpansion | 發布後改敘述，不影響已開始的作答 |
| 2 | solo-activity | 敘述型活動、多語 | 拿掉選項流程，改成自由文字表態，再用 stance_classify 歸類；「我其實改變想法了」＝重新歸類，舊立場留在紀錄；每則訊息存 locale | Courecta 的 StanceClassification、SoloTutorTurn | 學生用英文作答時，逐字稿保留原文 |
| 3 | course-management | 免註冊加入 | 課程設定加「允許免註冊」；QR 連結；訪客可以選課；`GET /course-join/{code}` 回 `allow_guest`；沒開時回 `GUEST_JOIN_DISABLED`（這個 code 在同一個 PR 加進 `REASON_CODES` 與前端文字，`EXPANSION_LOCKED`、`RADAR_NOT_READY` 也照這樣在第 1、6 項的 PR 加） | Courecta 的訪客帳號 migration | 訪客從掃碼到開始對話不需要 email |
| 4 | solo-activity | 旗標與學生指標 | 每則訊息存 flags；指標寫成一個純函式檔；`GET /solo/activities/{id}/progress` 帶出指標、趨勢、標記，並即時更新 | Courecta 的 flags | 危險傾向或惡意離題＝1 時，教師 progress 回該學生的標記；學生端回應裡沒有 flags |
| 5 | solo-activity | 統整引用 | 存放引用（新表 summary_sources），view 回傳 message id 與 quote 的起訖位置 | Courecta 的引用驗證；Amethus 的引用型別 | 每個 quote 都是該學生原句的子字串 |
| 6 | solo-activity | 統整與雷達 | 最終統整與確認迴圈，取代 submit_review：連續兩次「不太對」就標記「未確認」並結束。學生 ≥15 人走 PCA＋百分位，<15 人走 LLM 維度；`GET /solo/activities/{id}/radar`、改軸名的 PATCH | Courecta 的 `embed()`、final_summary、radar_*；Amethus 的雷達契約 | 兩條路回同一個契約 |
| 7 | app-shell | 免註冊加入 | 註冊 Courecta 提供的到期訪客去識別化排程工作，每日跑一次 | Courecta 的排程工作 | 第 8 天訪客已去識別化，作答還在 |
| — | content-authoring | 現有待辦 | 5 個端點補 response_model（清單在 `RESPONSE_MODEL_PENDING`） | Amethus 審 | 重產型別後沒有 diff |
| — | platform | 現有待辦 | 相容帳冊（`COMPATIBILITY-LEDGER.md`）裡的舊環境變數別名 | — | — |
| — | app-shell | 現有待辦 | `GET /api/v2/readiness` 補 response_model | Amethus 審 | 重產型別後沒有 diff |

## 注意
- 學生確認最後一題後按「送出回顧」，目前作答直接進入 `completed`，這是過渡做法，第 6 項會取代它。
- 舊單人對話的資料表已經搬到 `legacy_solo_dialogue` schema（migration 0017，issue #71）。要不要把舊資料帶進單人活動，等決定後再排，現在不用動。
- migration 順序：Courecta 的 identity-access → 你的 course-management → 你的 solo-activity，每個 down_revision 接前一個。

## 規則（repo 現行檢查會擋）
- 只 import 其他模組的 contracts／service／repositories；route 不互相引用，也不動態 import。`python scripts/check_modules.py` 的違規數只能變少。
- 回應一律要有 response_model。新增端點時同一個 PR 更新 `app/modules/contract/contracts.py`，並重產型別（`python scripts/gen_classroom_types.py`），重產後沒有 diff。
- 一個 PR 只動一個模組。改到別包的檔案時，照檔案所屬的模組分開送 PR，給那一包的負責人審。

## 送 PR 前的檢查
在 repo 根目錄依序跑，全部通過再送：
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

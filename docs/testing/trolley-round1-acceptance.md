# Round 1 電車難題驗收操作稿

這份操作稿補上 [產品規格 §13.3](../superpowers/specs/2026-09-19-socratic-tutor-design.md) 九步人工驗收所需的固定輸入與腳本切換方式。三份 YAML 是可載入的固定 provider 回覆；**它們只依每階的輪數回覆，不解析學生文字**。以下輸入是為了讓試玩時的對話前後一致，不是判斷器的輸入條件。

## 啟動與切換

從專案根目錄執行 `docker compose up -d`，開啟 <http://localhost:5173>。預設載入 `scripts/trolley.script.yaml`。要切換分支腳本，先結束正在試玩的對話，再執行下列其中一行，並**建立新 session**：

```bash
SCRIPT_PATH=/app/scripts/trolley.capped.script.yaml docker compose up -d --force-recreate backend
SCRIPT_PATH=/app/scripts/trolley.shifted.script.yaml docker compose up -d --force-recreate backend
docker compose up -d --force-recreate backend  # 恢復預設腳本
```

這些指令只重建後端容器，不清除資料庫。不要在同一個 session 的中途換腳本：新回覆會從目前輪數接上另一份腳本，驗收便失去可重現性。

## 一般路徑（預設腳本）

每送出一列文字算一輪。核對第一階開場白與 `ladders/trolley.yaml` 逐字相同，且未進入的階段不能在畫面或 API 洩漏標題。

| 情境 | 依序輸入的學生回覆 | 第三輪後預期 |
|---|---|---|
| 1. 失控的電車 | `我會轉向。` → `因為這樣只會死一個人，比五個人少。` → `若岔道有一百人而直行只撞一人，我就不會轉；我的原則仍是減少死亡，但這次我願承擔轉向害死一人的責任。` | `at_crossroad`；第一階 `goal_met`，可選「進入下一個情境」或「結束討論」；下一階標題仍隱藏 |
| 2. 天橋上的男子 | `我不會推他。` → `不能把無辜的人當成擋車工具。` → `轉向是改變車的路線，推人卻是直接用一個原本安全者的身體擋車。` | `at_crossroad`；第二階 `goal_met`，第三階標題仍隱藏 |
| 3. 器官移植醫生 | `我不會摘取器官。` → `醫生不能為了救人而殺害健康的人。` → `轉向是在既有危險中改變車的路線；摘器官則是主動殺害原本安全的人。即使能救五人，我也不接受。` | `awaiting_wrap_up`；第三階 `goal_met`，教授提議收尾 |

在每個路口按「進入下一個情境」後，才核對新標題與開場白。第二階送出第一輪後重新整理，應留在第二階、訊息完整；此時選「結束討論」，總結頁的第二階應為 `stopped_early`、第三階為 `skipped`，且第三階標題不揭露。另開 session 走完三階，驗證第三階後可以直接結束，也可以再補充三輪才自動以 `completed` 結束；三次補充的教授回覆各不相同。

## 達上限路徑（capped 腳本）

第一階依序輸入：`我不轉向。` → `說不上來。` → `還是說不上來。` → `只是直覺。` → `我無法指出原則。` → `我仍沒有定見。`。六輪的觀察值都缺理由；預期第六輪後第一階是 `capped`、路口可選結束，總結應顯示「還沒有定見」，而非 `goal_met` 或 `skipped`。

## 改變立場路徑（shifted 腳本）

第一階依序輸入：`我會轉向。` → `因為少死四個人。` → `想過那名側軌工人原本安全，我現在改為不轉向。` → `我改變是因為不願主動讓原本安全的人死亡，雖然五人仍會因此喪命。`。第三輪標記 `position_shifted`，因此**仍停在第一階**；第四輪說明轉變後，才預期 `goal_met` 並進入路口。此時可結束並檢查「改變立場」摘要。

## 現在能驗證到哪裡

固定腳本的載入、三階各輪回覆、路口 API 與達上限轉換已有自動測試：

```bash
docker compose exec -T backend python -m pytest tests/ladders/test_repository.py tests/tutor/test_scripted.py tests/api/test_advance.py tests/orchestrator/test_in_stage.py -q
```

後端已有 `POST /advance`，也會在 `max_turns` 到達且未達成時標記 `capped`；可用 API 和上述測試驗證。前端雖會依 `available_actions` 顯示「進入下一個情境」，但尚未將點擊接到 `/advance`，所以一般路徑從畫面仍只能走到第一個路口；完整九步驗收須待學生端流程補完後再執行。固定腳本的摘要目前不依實際造訪階段調整；提早結束時，**不要把預設腳本提及後兩階的摘要文字當作合格結果**。故障後重試可先跑既有後端測試，人工注入故障的操作仍待補齊。

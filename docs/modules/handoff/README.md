# 後端四包交接文件

每包一位負責人，各自有一條自己的分支。

| 包 | 名稱 | 模組 | 負責人 | 分支 | 文件 |
|---|---|---|---|---|---|
| A | 課堂 | classroom-core、group-dialogue、analytics | Hsy | `backend/Hsy` | [A-classroom.md](A-classroom.md) |
| B | 課程、單人活動與底層 | course-management、solo-activity、content-authoring、platform、app-shell | Ken | `backend/Ken` | [B-authoring-solo-base.md](B-authoring-solo-base.md) |
| C | 帳號與 AI | identity-access、ai-providers、llm-runtime | Courecta | `backend/Courecta` | [C-account-ai.md](C-account-ai.md) |
| D | 對接 | contract | Amethus | `backend/Amethus` | [D-contract.md](D-contract.md) |

## 後端開發流程
1. Arthur 收到需求，拆成各模組的改動，分給各包。
2. 各包在自己的分支 `backend/<名字>` 上開發。分支已經建好，內容是 `backend/main` 加上你自己的交接包（`docs/modules/handoff/start/<名字>.md`）。
3. 做完一個功能（或功能裡可以獨立合入的一段），就從自己的分支 PR 到 `backend/main`。
4. Arthur 審完後合進 `backend/main`。`backend/main` 的改動再以功能為單位重新打包，每個功能一個 PR 給 `develop`；功能做完整就進，不累積。
5. 改動 demo 過之後，PR 到 `stage`。

`backend/main` 有新東西時（例如其他包合進來的契約），請 merge 進自己的分支再繼續做。

## 第一次拿到這份文件：照這個順序
1. **認識產品**：讀 repo 根目錄 `README.md`，從開頭讀到「接下來讀什麼」。
2. **跑起來**：
   - 在 repo 根目錄跑一次 `npm install`，啟用 git hook。
   - 跑 `docker compose up -d`。
   - 跑 `docker compose exec backend python -m pytest tests -q`，確認全綠。
3. **讀規則**：`AGENTS.md`，讀完「不可妥協條款」「API 慣例」「分支流程」三節。
4. **讀地圖**：`docs/modules/README.md`（模組責任地圖），以及自己這包每個模組的 `docs/modules/backend/<模組>.md`。
5. **讀接下來要做的事**：
   - `docs/classroom/NEW-FEATURES.md`：六項新功能的跨包總表。
   - `docs/classroom/PROMPT-DESIGN.md`：LLM 的輸出與旗標。
6. **讀自己這包的交接文件**（上表）：照「新功能工作」一節排出自己的第一個 PR，在團隊 Discord 認領。

## 這一版和上一版的差別
- 舊的單人 ladder 對話已經刪除，solo-dialogue 模組也一起拿掉；單人對話改由 solo-activity 承接（不變條款測試的處理記在 issue #71）。
- course-management、solo-activity 併進 B 包。
- 每包新增「新功能工作」一節：改什麼、依賴誰、接哪些 API、怎麼驗收。

## 跨包接縫（會互相等的地方）
| 先做 | 後做 | 接縫 |
|---|---|---|
| C：llm-runtime 的新 schema | B：solo-activity、course-management 的呼叫端 | `SoloTutorTurn`、`ActivityExpansion` 等型別先合進 `backend/main`，B 才能接 |
| C：identity-access 的訪客帳號 migration | B：course-management 的訪客選課 | 帳號 `kind` 欄位 |
| C：ai-providers 的 `embed()` | B：solo-activity 的雷達 | `embed(texts) -> list[list[float]]` |
| B、C：每個新端點 | D：contract | response_model、reason code、型別重產 |

先做的一方，請把契約（型別與函式簽名）先開成一個小 PR 合進去。後做的一方可以先對著契約寫測試。

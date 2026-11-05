# 刪除舊單人對話之後的六項新功能：模組改動表

狀態：設計已定案。各包從自己的分支 `backend/<名字>/main` 開始開發（`backend/<名字>/` 底下可以再開分支），做完 TASKS 裡的一項就 PR 到 `backend/main`（流程見 `docs/modules/handoff/README.md`）。
各包的工作清單在 `docs/modules/handoff/<包>.md`。本檔是跨包總表，規定每個模組改什麼、模組之間怎麼引用、怎麼互動、接哪些 API。
LLM 的 prompt、輸出 schema 與旗標定義寫在 [PROMPT-DESIGN.md](PROMPT-DESIGN.md)。

端點路徑和欄位名是提案。實作時可以改，但改了要同一個 PR 更新本表與契約（`app/modules/contract/`），並重產型別。

## 0. 六項功能

| # | 功能 | 一句話 | 主要的包 |
|---|---|---|---|
| 1 | 免註冊加入 | 老師給 QR code，學生掃了、填暱稱就能開始；資料留 7 天，註冊後永久保存 | C、B |
| 2 | LLM prompt 設計 | 盤點所有用到 prompt 的地方，統一輸出 schema、旗標與鐵則 | C |
| 3 | 敘述型活動與多語 | 老師只寫一段敘述，其餘由 LLM 拓展；回覆與統整用學生或老師的語言 | B、C |
| 4 | 統整與雷達圖 | 對話中觸發確認統整，結束時產生最終統整；全班的歸納畫成雷達圖 | B、C |
| 5 | 旗標與學生指標 | 每則導師回覆附 10 個 0／1 旗標，後端算出認真度等指標給教師看 | C、B |
| 6 | 統整引用 | 統整的每一點都標出學生原句，點下去跳到原句 | C、B |

建議的開工順序：2（schema 先定）→ 3 → 1 → 5 → 6 → 4。3 是後面功能的地基；4 依賴 3、5、6 的輸出。

## 1. 模組改動總表

| 端 | 包 | 模組 | 功能 | 改動 |
|---|---|---|---|---|
| 後端 | C | identity-access | 1、3 | 帳號加 `kind`（guest／registered）與 `guest_expires_at`；email、password_hash 可為空（migration）；訪客 session；註冊時原地升級；找回提示只存雜湊；訪客加入時選語言；提供到期訪客去識別化的排程工作 |
| 後端 | C | ai-providers | 4 | 本地 embedding provider（預設 multilingual-e5-small，CPU 執行） |
| 後端 | C | llm-runtime | 2–6 | 新增或改寫 7 個 program 與對應 schema；鐵則 L1 加「回覆語言」、新增 6 份 L2；語言檢查與引用驗證接進 `guarded_generate` 的重試；30 則固定題組與三家模型評測；TTS 契約 |
| 後端 | B | course-management | 1、3 | 課程設定「允許免註冊」；QR 連結；訪客選課；活動內容改為「敘述＋立場空間」；發布時呼叫 activity_expansion，老師修改後鎖進 ActivityRevision；migration 把舊選項轉成立場空間 |
| 後端 | B | solo-activity | 3–6 | 拿掉選項流程，改成自由文字表態＋stance_classify；每則訊息存 locale 與 flags；指標純函式；最終統整與確認迴圈（取代現在回 501 的 submit_review）；引用存放；PCA、百分位與雷達彙總 |
| 後端 | B | app-shell | 1 | 註冊 identity-access 提供的到期訪客排程工作（每日一次） |
| 後端 | A | group-dialogue | 5（第二版） | 分組課個人追問套用同一組旗標 |
| 後端 | A | analytics | 4、5（第二版） | 分組課的教師分析帶出同一組指標與標記（重用 solo-activity 的指標純函式）；沿用單人活動的雷達契約 |
| 後端 | D | contract | 1、3–6 | 新端點的 response_model 與型別重產；新 reason code；雷達契約 |
| 部署 | — | backend 映像 | 4 | 映像內附 embedding 模型檔（主機負責人已同意；單 pod CPU 實測 1.2 GB 記憶體） |
| 前端 | — | auth | 1 | 掃碼加入頁、暱稱、找回提示、「註冊以保留紀錄」提示 |
| 前端 | — | course／authoring | 1、3、4、5、6 | 教師端 QR、允許免註冊開關；敘述編輯器與立場空間審閱；教師 panel 的指標欄、趨勢、特效列與雷達圖；點引用跳原句 |
| 前端 | — | solo-activity | 3、4、6 | 對話頁改成自由文字表態；最終統整確認卡；點引用跳原句 |
| 前端 | — | media | 語音 | 學生的話照常走 STT；老師講話時用 VAD 偵測到學生開口，就停掉老師的 TTS 並接著聽（不用全雙工模型） |

前端的畫面由美術出圖後再實作，本表只列前端需要接的資料。

## 2. 引用關係（後端 import）

規則照舊：只 import 對方的 `contracts`／`service`／`repositories`，route 不互引。`python scripts/check_modules.py` 的違規數維持 0。

| 模組 | 新增或改動的依賴 | 用來做什麼 | 在 modules.json 的 uses 裡嗎 |
|---|---|---|---|
| course-management → identity-access | 訪客帳號、session | 訪客選課 | 已在 |
| course-management → llm-runtime | activity_expansion | 發布時拓展敘述 | **要新增**（目前只有 platform、identity-access） |
| course-management → ai-providers | 老師的金鑰鏈 | 拓展時用老師的模型 | **要新增** |
| solo-activity → llm-runtime | solo_tutor、stance_classify、final_summary、radar_* | 對話、歸類、統整、雷達 | 已在 |
| solo-activity → ai-providers | `embed(texts)` | 雷達的向量 | 已在 |
| solo-activity → course-management | ActivityRevision（敘述、立場空間） | 對話的題目來源 | 已在 |
| llm-runtime → ai-providers | provider 鏈 | 呼叫模型 | 已在 |
| platform（排程）→ identity-access | 到期訪客清單 | 去識別化 | **反向**：platform 不能依賴業務模組。改由 identity-access 提供排程工作，app-shell 註冊 |
| group-dialogue → llm-runtime | personal_tutor 的 flags（第二版） | 分組課旗標 | 已在 |

要動 `modules.json` 的兩條（course-management 新增依賴 llm-runtime、ai-providers）由 B 包在同一個 PR 改，並請 C 包負責人審。

## 3. 互動關係

### 3.1 免註冊加入
1. 老師在課程設定打開「允許免註冊」，畫面顯示 QR（內容＝加入網址＋課程代碼）。
2. 學生掃碼 → `GET /course-join/{code}`（預覽，回 `allow_guest`）→ 填暱稱、選語言 → `POST /auth/guest`（建訪客帳號與 session）→ `POST /courses/join`（照舊）。
3. 訪客帳號 7 天後由每日排程去識別化：刪暱稱與找回提示，作答與統計保留、不再連到人。
4. 學生在 7 天內註冊 → `POST /auth/guest/upgrade`：同一個帳號 id 補上 email 與密碼，`kind` 改成 registered，資料全部保留。

### 3.2 敘述型活動
1. 老師寫敘述 → `POST /activities/{id}/expansion`（同步呼叫 activity_expansion，回立場空間與追問方向的草稿）。
2. 老師修改 → `PUT /activities/{id}/expansion` → 發布時鎖進 ActivityRevision。發布後學生看到的永遠是鎖住的那版。
3. 學生自由打字表態 → solo-activity 呼叫 stance_classify 歸到立場空間的某一個 → 之後每一輪呼叫 solo_tutor。
4. 學生說「我其實改變想法了」＝重新歸類，舊立場留在紀錄裡。

### 3.3 單人活動一輪（含旗標、統整、引用）
```
學生訊息 → solo-activity 存訊息（locale）
        → llm-runtime.solo_tutor（輸入：敘述＋立場空間＋帶代號逐字稿＋output_locale）
        → 回 SoloTutorTurn（reply_text、move、observations、flags、guard、confirm_summary?）
        → 語言檢查／引用驗證不過 → guarded_generate 重試一次
        → solo-activity 存導師訊息、flags；更新指標
        → 推播教師進度 view（即時）
```
- 後端判定可以確認時，才要求 solo_tutor 產生 `confirm_summary`（points＋sources），學生按「確認」或「不太對」。
- 最後一次確認之後，solo-activity 呼叫 final_summary，學生確認最終統整。連續兩次「不太對」就標記「未確認」並結束。這一步取代現在的 submit_review（目前回 501）。
- 指標只由後端從 flags 算，LLM 不直接打分。

### 3.4 雷達圖
1. 活動結束後，solo-activity 收齊每位學生的最終統整 `normalized_text`。
2. 學生數 ≥ 15：`ai_providers.embed()` → PCA → 每個軸取兩端各 5 位學生的統整 → llm-runtime.radar_axis_naming 產生軸名與兩端描述（老師可以改名）→ 投影值換成活動內百分位 → 0–4 分。
3. 學生數 < 15：llm-runtime.radar_dimensions 定 4–6 個維度 → radar_scoring 每人每維打 0–4 分並附引用。
4. 兩條路都輸出同一個雷達契約，前端只接一種格式。第一版只給老師看。

### 3.5 語音（與六項功能並行）
- 學生的話照常走 STT：語音 → 文字 → 同一條文字流程 → 老師的回覆用 TTS 播放。
- 不用全雙工語音模型。看起來像全雙工的效果是用 TTS 端的工程手法做出來的：老師講話時，用 VAD 偵測到學生開口，就停掉老師的 TTS，接著聽學生說。
- 所以旗標、統整、引用都直接適用於語音對話。

## 4. API 關係（提案）

| 方法與路徑（前綴 `/api/v2`） | 模組 | 誰呼叫 | 新增／修改 | 備註 |
|---|---|---|---|---|
| `POST /auth/guest` | identity-access | 前端 auth | 新增 | body：nickname、locale、course_code、recovery_hint?；回 session 與帳號 view |
| `POST /auth/guest/upgrade` | identity-access | 前端 auth | 新增 | body：email、password；回升級後帳號 |
| `GET /auth/me` | identity-access | 前端 | 修改 | 加 `kind`、`guest_expires_at` |
| `GET /course-join/{code}` | course-management | 前端 auth | 修改 | 加 `allow_guest` |
| `PATCH /courses/{course_id}` | course-management | 前端 course | 修改 | 加 `allow_guest` |
| `POST /activities/{id}/expansion` | course-management | 前端 authoring | 新增 | 產生立場空間草稿 |
| `PUT /activities/{id}/expansion` | course-management | 前端 authoring | 新增 | 老師修改；發布時鎖進 revision |
| `POST /solo/attempts/{id}/{action}` | solo-activity | 前端 solo-activity | 修改 | action 清單改為：`message`、`state_position`、`confirm_summary`、`revise_summary`、`confirm_final`、`reject_final`、`retry`；`available_actions` 照舊由後端給 |
| `GET /solo/attempts/{id}` | solo-activity | 前端 solo-activity | 修改 | 統整帶 `points[].sources[]`（message_id、quote、起訖位置）；**不回傳 flags** |
| `GET /solo/activities/{id}/progress` | solo-activity | 前端 course | 修改 | 每位學生加指標、趨勢、標記（危險傾向、惡意離題）與撐起指標的訊息 id |
| `GET /solo/activities/{id}/radar` | solo-activity | 前端 course | 新增 | 雷達契約：dimensions［name、low_pole、high_pole、source＝embedding｜llm］＋每位學生每維分數＋引用 |
| `PATCH /solo/activities/{id}/radar/dimensions/{index}` | solo-activity | 前端 course | 新增 | 老師改軸名 |
| `POST /speech/tts` | llm-runtime | 前端 media | 新增 | 文字→音訊＋字時間點（模組地圖上原本列為「等契約」） |

每個新端點都要有 response_model，並同時更新 `app/modules/contract/contracts.py` 與重產型別。新的錯誤一律走 stable reason code，例如 `GUEST_JOIN_DISABLED`、`GUEST_EXPIRED`、`EXPANSION_LOCKED`、`RADAR_NOT_READY`。每個新 code 由第一次 raise 它的 PR 一起加進 `REASON_CODES` 與 `frontend/src/contract/errorText.ts`（contract gate 要求目錄和程式裡實際 raise 的 code 完全一致，不預先登記）：`GUEST_JOIN_DISABLED`、`EXPANSION_LOCKED`、`RADAR_NOT_READY` 在 B 包的 PR，`GUEST_EXPIRED` 在 C 包的 PR。

引用分兩層：LLM 輸出用 `message_ref`（逐字稿裡的訊息代號，例如 m3）＋ quote；後端驗證通過後換成資料庫的 `message_id`，並算出 quote 在原文裡的起訖位置。對外 API 與共用型別一律用 `message_id`＋quote＋起訖位置（LLM 端的格式見 PROMPT-DESIGN 第 5 節）。

## 5. 資料與 migration

| 模組 | 變更 |
|---|---|
| identity-access | accounts：加 `kind`、`guest_expires_at`、`recovery_hint_hash`；`email`、`password_hash` 改可為空（唯一約束只對非空值） |
| course-management | courses：加 `allow_guest`；activities／activity_revisions：加 `narrative`、`stance_space`（JSON）、`expansion_locked_at`；舊選項轉成 stance_space |
| solo-activity | messages：加 `locale`、`flags`（JSON）、`message_ref`；新表 summary_sources（統整點 → 訊息 → quote 位置）；新表 radar_results（活動、維度、學生分數、來源） |

migration 依模組順序：identity-access → course-management → solo-activity。每個 migration 的 down_revision 接前一個。

## 6. 驗收

| 功能 | 驗收（每項都要有測試） |
|---|---|
| 1 | 訪客掃碼到開始對話不需要 email；第 8 天訪客已去識別化、作答還在；7 天內註冊後帳號 id 不變、紀錄都在；課程沒開「允許免註冊」時回 `GUEST_JOIN_DISABLED` |
| 2 | 30 則固定題組在 OpenAI、Anthropic、Gemini 各跑一次，出報表：schema 合格率、每個旗標的一致率、拉回遵守率、輸出語言正確率、引用有效率（只出報表，不擋合併） |
| 3 | 發布後改敘述不影響已開始的作答；學生用英文作答時，逐字稿保留原文，給老師的統整用老師的語言 |
| 4 | 15 人以上走向量路線，以下走 LLM 路線，兩條路回同一個契約；學生兩次「不太對」後標記「未確認」並結束 |
| 5 | 每則導師回覆都存 10 個旗標；指標只在一個純函式裡算；危險傾向或惡意離題＝1 時，教師 progress 回該學生的標記；學生端的回應裡沒有 flags |
| 6 | 每個引用的 quote 都是該學生原句的子字串；不合格的引用被丟掉，整份沒有有效引用時重生一次 |

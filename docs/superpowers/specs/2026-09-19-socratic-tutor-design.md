# 蘇格拉底式對話機器人 — 第一輪設計規格

- 日期：2026-09-19
- 範圍：第一輪（Round 1）產品功能設計
- 相關文件：
  - `docs/superpowers/specs/2026-09-19-ai-collaboration-architecture-design.md`（團隊協作與 AI 輔助開發基礎設施，以下簡稱「協作設計」）
  - `docs/product/product-overview.md`（產品說明，PM 取向）

---

## 1. 背景與目標

受哈佛「Justice」課程（Michael Sandel）啟發，重建該課堂的蘇格拉底式教學互動。

**核心目標不是問倒學生，而是讓學生照見自己原有的立場。** 引用課堂原話的精神：「這門課沒有要教會你們任何新的知識，它的目標只有協助讓你意識到你原本就已經知道的事情。」

系統透過一連串遞進的道德情境，讓學生表態、說出理據、接受追問，最終看清自己實際採用的道德原則、以及那個原則會在哪裡站不住。

這個定調有兩個直接的設計後果，貫穿整份規格：

1. **收尾的判準是「學生看清楚了」，不是「學生答不出來」。** 學生誠實地說「我說不上來」也算達成 — 發現自己原則的邊界正是目的。
2. **總結是產品的交付物，不是附錄。** 整段對話的價值兌現在最後那面鏡子。

### 單人模式的定位

第一輪只支援單人對話。原課堂有一半的力量來自同儕壓力（其他學生的反駁、全場舉手表決），單人模式必然缺這塊。但單人也提供了一個**隱蔽、可以放心表達真實想法的空間** — 幾百人注視下，很多人不敢講真話。這被視為設計上的取捨而非純粹的損失。同儕維度（匿名立場分佈）留到第二輪。

---

## 2. 第一輪範圍

### 做

- 一條寫死的案例階梯：電車難題（三階）
- 純文字對話介面
- 對話推進狀態機（後端主導）
- LLM Provider 抽象層，第一輪以腳本實作驗收
- 結束後的結構化立場總結（畫面上只顯示一句話）
- 學生端四個畫面：首頁、對話、總結、歷史紀錄
- Local 身分（前端 uuid，無登入）
- 未完成 session 的中斷續跑
- Postgres 持久化、docker-compose 起資料庫

### 不做（已討論並明確延後）

| 項目 | 延後理由 |
|---|---|
| 教師出題介面 | 第一輪固定情境。但階梯以外部定義檔存放，第二輪的出題介面本質上就是這個檔案的編輯器 |
| 同儕匿名立場分佈 | 有冷啟動問題（第一個使用者看不到任何同儕）。需先累積資料 |
| 班級論點分佈儀表板 | 依賴同儕資料 |
| 真實帳號系統 | MVP 風險不在此。Local 身分已足夠驗證流程 |
| 語音（STT） | 未來提供錄音轉文字，非即時 speech-to-speech |
| 串流輸出（SSE） | 體驗優化。API 契約已預留接縫，之後是替換傳輸層，不動流程邏輯 |
| 疲乏偵測 | 優化項目。判定為第二輪之後 |
| 續跑「已結束」的 session | 改以「續篇 session」形式實作（見 §11） |
| 對話品質驗證（反諂媚等） | 第一輪驗收的是流程與資料流，不是對話品質。專門的一輪處理 |

### 驗收標準

人工驗收流程能實際跑通，使用哈佛課堂的實際案例，LLM 回覆以腳本固定，**主軸是定下學生端流程**。詳見 §13。

---

## 3. 術語

| 詞 | 定義 |
|---|---|
| **大主題 / 階梯（ladder）** | 一組遞進的道德情境，共同測試同一條軸線。第一輪只有「電車難題」一條 |
| **階段（stage）** | 階梯中的一個情境。第一輪三階：電車難題 → 天橋胖子 → 器官移植醫生 |
| **輪（turn）** | 學生發言 + 教授回應的一次來回 |
| **session** | 學生跑一次階梯的完整紀錄，產生一份總結 |
| **路口（crossroad）** | 一階達成後的分歧點，學生選擇進入下一階或在此結束 |
| **observations** | Provider 每輪回報的結構化觀察，是 Orchestrator 裁決的依據 |

---

## 4. 教學設計決策

這些是產品的靈魂，實作時不得為了方便而妥協。

### 4.1 進度只給數量，不給名稱

進度指示器顯示「情境 1 / 3」，**不顯示未進入階段的名稱**。

理由：變形題的整個教學效果依賴學生在答第一題時不知道第二題會怎麼翻轉他的答案。若進度列寫著「下一關：天橋胖子」，學生答電車難題時就會先預判、先自我保護，鏡子就照不到真實直覺。

實作保證：**API 在學生進入之前不回傳該階的 `title`** — 不是前端自律藏起來，是後端根本不給。

### 4.2 情境開場白逐字輸出，不經 LLM

每一階的開場白直接取自階梯定義檔，一字不改。

理由：教師寫的題目不該被模型改寫。電車難題之所以有效，正在於敘述的精確 — 哪些細節給了、哪些沒給都是設計。讓模型「用自己的話說一遍」會稀釋掉這個，而且破壞可重現性。

### 4.3 階段達成的三條件

一階「夠了」的操作型定義是三件事**同時**成立：

1. **表態** — 學生對這個情境做出了選擇
2. **給出理據** — 說得出為什麼，是一個能被命名的原則，不是「就覺得不對」
3. **理據被測試過至少一次** — 教授追問過（變更條件、指出後果、要求一致性），而學生做出了回應

第三點是關鍵：**沒被測試過的表態只是直覺，不是已經照見的立場。**

學生回應時說「我說不上來」**也算通過** — 發現自己原則的邊界正是這堂課要的。這是「照見」與「問倒」的分界。

### 4.3.1 輪數地板必須明文執行，不能靠推論

直覺上「`reason_tested` 在第一輪不可能成立（教授還沒問），所以最少兩個來回是天然的地板」——**但這是錯的，這條規格曾經這樣寫，已更正。**

那句話是對 provider 誠實的**假設**，不是保證。模型錯報 `reason_tested: true` 時，學生會在第一輪就過關——而他的立場根本還沒被挑戰過，鏡子完全沒照到。這正好是整個產品唯一要做的事失敗了。

因此判準加上明文的地板：**本階至少已完成一個來回**。

`StageAdvancePolicy` 的完整判準是：

```
turn_count >= 1  AND  (not position_shifted)  AND  has_position  AND  has_reason  AND  reason_tested
```

**這四條規則必須全部住在 `StageAdvancePolicy`，不得有任何一條留在 Orchestrator**（§5.3 稱它為「判準的唯一修改點」，那句話要字面成立）。否則讀 `policy.py` 的人會以為自己看到了全部規則。

### 4.4 兩種否決推進的情況

即使三條件齊備，Orchestrator 在以下情況**不得**推進：

- **學生剛改變立場**（`position_shifted`）— 這是整堂課最有價值的一刻，應追問「你剛剛說 X，現在說 Y，中間哪裡不一樣？」。此時放人走等於把最好的鏡子收起來。
- **理據還停在感覺**（`has_reason` 為假）— 換個角度再問，不是放行。

### 4.5 硬上限到了但未達成，不得假裝達成

標記為 `capped`，路口照常出現，總結誠實寫出「這個情境你還沒有形成定見」。比硬湊一個結論更貼近產品目標 — 照見包含照見自己的模糊。

### 4.6 四種階段結束狀態必須可區分

`goal_met`（想清楚了）／`capped`（問到上限仍未形成定見）／`stopped_early`（已進入情境，未達成也未到上限時主動結束）／`skipped`（提早結束，沒走到）。在總結畫面與未來的班級分佈中意義完全不同，畫面上要看得出差別。

---

## 5. 架構

**取向：後端狀態機主導（Orchestrator-led）。** 已在討論中與 agentic 取向、前端驅動取向比較後選定。

```
React SPA ──HTTP──▶ FastAPI
                      │
                      ├─ API layer（薄，只做 HTTP ↔ DTO）
                      │
                      ├─ Orchestrator ★ 對話推進狀態機
                      │    「現在第幾階、能不能前進、該不該收尾」
                      │    不知道 LLM 的存在
                      │
                      ├─ LadderRepository ── ladders/trolley.yaml
                      │
                      ├─ TutorGateway ★ 唯一知道 LLM 的地方
                      │    pre-processor → provider → post-processor
                      │    不知道推進規則
                      │      └─ LLMProvider 介面
                      │           ├─ ScriptedProvider（本輪驗收）
                      │           └─ ClaudeProvider / GeminiProvider…
                      │
                      └─ Repository ──▶ PostgreSQL
```

### 5.1 核心分界線

**Orchestrator 不知道 LLM 存在；TutorGateway 不知道推進規則。**

這條線是「腳本驗收」與「真 API」能共用同一套流程的原因 — 換 provider 只換文字來源，闖關節奏一個字都不會變。

### 5.2 為什麼需要 Orchestrator

它是系統裡唯一知道「這堂課該怎麼走」的地方，而這件事必須由我們決定，不能交給模型。

| 決策 | 不能交給 LLM 的理由 |
|---|---|
| 現在在第幾階 | 這是事實不是判斷。模型會弄錯、跳階、發明不存在的階 |
| 達成後是否推進 | LLM 只提供判斷依據；是否因此前進是課程決策 |
| 硬上限 | 防無限迴圈的機制寫在 prompt 裡，模型跑偏時它也一起偏 |
| 學生按下結束 | 純事件，不該經過模型 |
| 路口提示與不劇透規則 | 教學設計，寫在 prompt 裡無法驗證是否被遵守 |

它**不**負責：生成文字、知道 prompt 內容、碰 SQL、知道 HTTP。它是純邏輯：輸入 `(session 狀態, 事件)` → 輸出 `(要附加的訊息, 新狀態)`，可用假的 gateway 與 repository 完整單元測試。

### 5.3 各模組職責

| 模組 | 做什麼 | 依賴 |
|---|---|---|
| **Ladder 定義檔** | 純資料。大主題 → 階段序列，每階含情境敘述、教學目標、追問提示、硬上限 | 無 |
| **LadderRepository** | 載入 + schema 驗證。定義檔不合法則服務啟動失敗（不等到跑到第三階才爆） | 定義檔 |
| **Orchestrator** | 推進狀態機，見 §5.2 | LadderRepository、TutorGateway、Repository |
| **StageAdvancePolicy** | 具名純函式，實作 §4.3 的完整判準（輪數地板 + 三條件 + 立場未改變）。**判準的唯一修改點——不得有任何一條規則留在 Orchestrator** | 無 |
| **TutorGateway** | 對外兩個方法：`respond(stage, history)`、`summarize(session)`。內部 pre-processor → provider → post-processor | LLMProvider |
| **LLMProvider** | `generate(messages, schema) -> structured` | — |
| **Repository** | 持久化 CRUD | SQLAlchemy |
| **Identity** | 前端 uuid 存 localStorage，header 帶入。後端只認此 id，不存姓名 | — |

### 5.4 三層輸入把關（職責不同，不可互相取代）

- **前端** — 字數計數、送出鈕禁用。純體驗，不是防線
- **API 層** — 字數上限、拒空白、訊息總數上限。機械性契約檢查，**後端必須自己擋**
- **Pre-processor** — 脫敏、離題偵測、未來的安全過濾。內容層，會隨產品持續生長

---

## 6. 案例階梯定義檔

第一輪雖然寫死，仍以外部檔案存放（`ladders/trolley.yaml`），因為第二輪的教師出題介面本質上就是這個檔案的編輯器。

```yaml
id: trolley
version: 1
title: 電車難題
stages:
  - key: trolley_basic
    title: 失控的電車
    opening_statement: |
      （逐字輸出給學生的情境敘述）
    teaching_goal: |
      讓學生意識到自己正在用「人數多寡」計算道德。
    probe_hints:
      - 若學生支持轉向：追問數字是否決定對錯
      - 若學生反對轉向：追問不作為是否就免責
    max_turns: 6
  - key: footbridge
    title: 天橋上的胖子
    ...
  - key: transplant
    title: 移植醫生
    ...
wrap_up:
  extra_turns_cap: 3
```

`probe_hints` 是給 LLM 的方向提示，不是逐字台詞。腳本 provider 忽略它。

上面只是格式示意。**三階實際的情境敘述文字需在實作階段依哈佛課堂的原案例撰寫**（電車難題 / 天橋胖子 / 器官移植醫生），並經 Fizzy 確認 — 敘述的精確度直接決定教學效果（見 §4.2），不可隨手寫。

---

## 7. 資料模型

### `learners`
`id`(uuid, PK, 前端產生) · `created_at`

極簡，不存姓名。第二輪接真帳號時補上 `account_id`，其他表不動。

### `sessions`
`id` · `learner_id`(FK) · `ladder_id` · `ladder_version` · `status`(active/ended) · `flow_state` · `current_stage_index` · `parent_session_id`(nullable) · `started_at` · `ended_at` · `end_reason`(student_ended/completed)

- `ladder_version`：階梯定義之後會改。沒有這欄，半年後看舊 session 不知道學生當時被問了什麼
- `parent_session_id`：為未來的「續篇 session」預留，第一輪永遠為 null

### `stage_progress`
`session_id` · `stage_index` · `stage_key` · `status`(not_started/in_progress/goal_met/capped/stopped_early/skipped) · `turn_count` · `principle_label` · `position_shifted` · `started_at` · `ended_at`

**這張表是第二輪教師端的資料來源** —「這位學生答了哪幾題」直接查，不用另外做。

### `messages`
`session_id` · `seq` · `stage_index` · `role`(student/tutor/system) · `content` · `observations`(jsonb，僅 tutor) · `created_at`

- `observations` 掛在該則 tutor 訊息上，不另開表。之後要檢討「模型當時為什麼判斷理據已被測試」，證據都在
- `system` 用於路口提示，存下來歷史回顧才忠實

### `summaries`
`session_id` · `core_principle` · `tension` · `stance_by_stage`(jsonb) · `shifted` · `raw`(jsonb) · `created_at`
unique: `session_id`

- **一個 session 一份總結。** 這不是簡化，是 §11.5 刻意要的性質——續篇採「開新 session」的形式，正是為了讓每份總結各自對應一段完整、乾淨的對話。續篇鏈由 `sessions.parent_session_id` 承載，續篇的總結掛在新 session 上
- 曾一度規劃 `(session_id, seq)` 複合鍵「為續篇預留」，已移除：續篇既然是新的一列 session，`seq` 永遠不會超過 1，而那句理由會誤導人去假設「一個 session 可以有多份總結」並據此寫聚合查詢或畫面。§10 的總結重試是覆寫而非追加，同樣不需要 `seq`
- API 路徑因此維持單數 `/summary`（§9）
- 第一輪畫面只顯示 `core_principle`，但四個欄位全部存。第二輪的班級分佈直接聚合 `stance_by_stage` 與 `shifted`，不用回頭重新解析文字

`stance_by_stage` 形狀：
```json
[{"stage_key": "trolley_basic", "label": "後果主義", "note": "以人數決定"}, ...]
```

`principle_label` 值域：`後果主義` / `義務論` / `混合` / `未明`

所有時間存 UTC，前端轉本地顯示。

---

## 8. 狀態機

```
        ┌──────────────────┐
        │ active_in_stage  │◀──┐
        └────────┬─────────┘   │ 未達成 / 立場剛改變（否決推進）
                 │ StudentMessage
       ┌─────────┴─────────┐
       │ goal_met 或 capped │
       └─────────┬─────────┘
          ┌──────┴───────┐
     還有下一階         沒有下一階
          │                 │
          ▼                 ▼
  ┌───────────────┐  ┌──────────────────┐
  │ at_crossroad  │  │ awaiting_wrap_up │
  │「還有 N 個情境，│  │ 教授提議收尾      │
  │ 或在此結束」   │  │ 學生可繼續講      │
  └───┬───────┬───┘  └────┬──────────┬──┘
   繼續│    結束│       接受│     繼續講│（extra_turns_cap）
      │       │           │          └─▶ 回 active_in_stage
      │       ▼           ▼
      │    ┌─────────────────┐
      │    │      ended      │
      │    │ 進行中→stopped_early│
      │    │ 未走到→skipped    │
      │    │ 產生 summary     │
      │    └─────────────────┘
      ▼
  下一階 in_progress，逐字輸出開場白
```

**「結束討論」從任何未結束狀態皆可觸發 → `ended`，不經過模型。** 當前階若仍為 `in_progress`，標記 `stopped_early`；尚未進入的階標記 `skipped`；已是 `goal_met`／`capped` 的階保留原狀態。圖中未畫出所有入口，以免雜亂。

`ended` 之後任何動作一律拒絕。

### 每輪的處理順序（`POST /messages`）

1. 驗證（狀態、字數、非空）
2. **存入學生訊息並 commit**（見 §10）
3. `TutorGateway.respond(stage, history)` → 教授台詞 + observations
4. 存入 tutor 訊息（含 observations），更新 `stage_progress`
5. `StageAdvancePolicy` 裁決；套用 §4.4 的否決規則；檢查硬上限
6. 決定新的 `flow_state`，回傳 SessionView

---

## 9. API

**端點形式遵循兩條並列規則**（見協作設計 §7.4）：資源的 CRUD 用 REST；狀態機轉換用 `POST /{resource}/{id}/{action}`，且 action 名稱必須出現在 `available_actions` 的 Literal union 裡。下表中 `/advance`、`/end`、`/retry` 屬後者，其餘皆屬前者。

身分：header `X-Learner-Id: <uuid>`。後端驗證 session 屬於該 learner，否則 403。這不是真的安全機制，但它是第二輪換成真認證時唯一要改的地方。

| 端點 | 說明 |
|---|---|
| `POST /api/sessions` | body `{ladder_id}`（第一輪固定 `trolley`）。建立 session，回傳第一階開場白 |
| `GET /api/sessions/{id}` | 完整狀態 + 全部訊息。續跑與歷史回顧共用 |
| `POST /api/sessions/{id}/messages` | body `{text}`。送出學生發言 |
| `POST /api/sessions/{id}/advance` | 路口：進入下一個情境 |
| `POST /api/sessions/{id}/end` | 結束討論。**立即回傳 `status=ended, summary=null`** |
| `POST /api/sessions/{id}/summary` | 產生總結。可重複呼叫，成功才寫入（同時作為失敗重試） |
| `GET /api/sessions/{id}/summary` | 取得總結，供前端輪詢 |
| `POST /api/sessions/{id}/retry` | 上一輪 provider 失敗時重跑，不需學生重打 |
| `GET /api/sessions` | 該 learner 的歷史列表（含未完成的） |
| `GET /api/ladders/{id}` | 階梯公開資訊：標題、總階數。**不含各階細節** |

### 9.1 統一回應形狀

所有會改變狀態的端點回傳同一個 `SessionView`：

```jsonc
{
  "session": { "id", "status", "flow_state", "current_stage_index", "total_stages" },
  "stage":   { "index", "key", "title", "opening_statement" } | null,
  "appended_messages": [ { "seq", "role", "content" } ],
  "available_actions": [...],   // 見下表
  "summary": { "core_principle", "stage_outcomes" } | null
}
```

| `flow_state` | `available_actions` |
|---|---|
| `active_in_stage` | `["send_message", "end"]` |
| `at_crossroad` | `["advance", "end"]` |
| `awaiting_wrap_up` | `["send_message", "end"]` |
| `ended` | `[]` |

「結束討論」在所有未結束的狀態皆可用 — 與 §8 一致。

**`available_actions` 的元素型別定義為 Literal union，不是裸字串**：`Literal["send_message", "advance", "end"]`。這樣由 OpenAPI 產生的前端型別是 union type，前端若比對一個不存在的動作名稱會在編譯期被擋下。`flow_state`、`status`、`principle_label` 同樣以 Literal／Enum 定義。

**`available_actions` 由後端決定，前端不自行推導。**

理由：否則狀態機會被實作兩次（後端一次、前端一次）然後慢慢走鐘。不劇透、路口規則、結束時機這些保證必須只活在 Orchestrator 裡。

`stage.title` 同理：未進入的階段不回傳標題，前端想劇透也沒東西可洩。

### 9.2 總結為非同步

`POST /end` 立即回傳，前端跳到總結頁顯示「教授正在整理你剛剛說的…」，再輪詢 `GET /summary`。

理由：接上真 LLM 後，同步版會讓學生盯著轉圈好幾秒 — 而這是整段體驗的最後一刻。與串流不同，串流是體驗優化可延後；這個若做成同步，接真 API 後前端流程必須改寫。

### 9.3 串流接縫

`POST /messages` 現在回傳完整物件。未來加 SSE 只是同一端點換一種傳輸，Orchestrator 與前端的狀態流程不動。

---

## 10. 錯誤處理

### 一條不能妥協的規則

**學生的訊息在呼叫 provider 之前就先落地並 commit。**

學生打了一大段對電車難題的思考，結果模型超時、整段消失 — 這是這個產品最不能發生的事。Provider 失敗回 503，學生訊息仍在，前端顯示「教授那邊斷線了」並提供重試；`POST /retry` 重跑最後一輪。

### 其他

- Provider 回傳格式不合（observations 缺欄位、JSON 壞掉）由 post-processor 擋下，**自動重試一次**，再失敗才算失敗
- 總結產生失敗：session 已 `ended` 但無 summary。總結頁顯示「整理失敗」+ 重試按鈕，走 `POST /summary`。不能讓一次 LLM 失敗讓整段對話白跑
- 同一 session 的並發請求以 `SELECT FOR UPDATE` 序列化 — 學生連點兩下不會產生兩條分岔的對話
- `retry` 設次數上限，避免無限重打 API

---

## 11. 前端

### 11.0 第一輪的前端刻意很薄

第一輪的驗收是流程，不是視覺。但「簡單」有兩種意思，只有其中一種適用：

**視覺簡單 ✅** — 砍掉元件庫（Mantine／MUI／Tailwind）、設計系統、動畫與過場、資料層抽象（React Query 之類；總共就那幾支 API，手寫 client ＋ `useState` 足夠，多一個抽象會讓 15 個人的 AI 寫出 15 種用法）。蘇格拉底頭像先用佔位圖。對話畫面天生單欄，不做手機專用優化也不會壞，但版面別寫死寬度。

**結構簡單 ❌** — 第一輪的前端**不是拋棄式的，它是後續十幾個畫面會照抄的範本**（協作設計 §3、§5）。若寫成「全部塞在一個元件、fetch 寫在 JSX 裡、自己判斷 `flow_state`」，接下來每個畫面都會長成那樣，而且每個都違反 §9.1。

做對結構幾乎不花額外時間——前端本來就很薄（§11.2），差別只是多分幾個檔案。四件不能砍：

1. **API client 集中在一個模組**，型別由 OpenAPI 產生、不手寫（協作設計 §8.3 的契約漂移檢查靠這個）
2. **`SessionView` 是唯一的狀態來源**，元件不得自行由 `flow_state` 推導任何東西
3. **`frontend/src/invariants/` 的測試**（受 CODEOWNERS 保護）
4. **路由**（四個畫面）

#### 選型

| 項目 | 選擇 | 理由 |
|---|---|---|
| 建置 | **Vite** | CRA 已停更；不用 Next.js——後端是 FastAPI，要的是純 SPA |
| 路由 | **React Router** | 四個畫面 |
| 測試 | **Vitest + React Testing Library** | Vite 原生，設定最少，跑得快 |
| 樣式 | **純 CSS** | 見 §11.6：不導入設計系統正是讓未來重做便宜的條件 |

#### 目錄結構與 `ActionBar`

```
frontend/src/
├── api/
│   ├── client.ts            ← 所有 fetch 集中
│   └── types.ts             ← OpenAPI 產生，不手寫
├── pages/
│   ├── Home.tsx
│   ├── Conversation.tsx     ← 範本檔案
│   ├── Summary.tsx
│   └── History.tsx
├── components/
│   ├── MessageList.tsx
│   ├── ActionBar.tsx        ← 規則的實體化
│   └── ProgressIndicator.tsx
├── invariants/
│   └── actionBar.test.tsx   ← CODEOWNERS 保護
└── App.tsx
```

**`ActionBar` 只接收 `available_actions`，渲染對應按鈕，不知道 `flow_state` 是什麼。**

這讓「前端不推導狀態」這條規則有一個實體的檔案可以指——`AGENTS.md` 不必寫抽象原則，直接寫「按鈕一律經過 `ActionBar`，不要在頁面裡自己判斷」（協作設計 §7.2 要的正是指向實例而非描述原則）。invariants 測試也因此有明確的對象。

### 11.1 四個畫面

**首頁** — 首次進入產生 uuid 存 localStorage。入口：「開始討論」、「歷史紀錄」。偵測到未完成 session 時，最上方出現「繼續上次的討論」。

**對話介面** — 蘇格拉底頭像 + 訊息串、輸入框、進度指示器「情境 1 / 3」（只有數字）、常駐的「結束討論」。走到路口時輸入框鎖住，換成兩個按鈕：「進入下一個情境（還有 N 個）」／「在此結束」。此切換來自 `available_actions` 的變化，非前端判斷。

**總結介面** — 一句話的 `core_principle`；下方列各情境及狀態。`goal_met`（想清楚了）、`capped`（還沒有定見）、`stopped_early`（中途結束）與 `skipped`（沒有走到）在畫面上必須看得出差別。產生中顯示「教授正在整理…」，失敗顯示重試。

**歷史紀錄** — 列出所有 session：日期、走到第幾階、狀態。已結束 → 跳總結頁；未結束 → 直接續跑。

### 11.2 前端不維護任何流程狀態

只持有當前的 `SessionView` 與輸入框文字。這讓前端很薄，第一輪的測試重心可全部壓在後端。

### 11.3 結束討論需二次確認

結束不可逆，按鈕又常駐。確認文案須說明後果：「結束後這次討論會封存並產生總結，之後可以再開新的一輪，但無法回到這一次。」

### 11.4 同時只允許一個進行中的 session

按「開始討論」時若已有未完成的 session，詢問「繼續上次的，還是重新開始（舊的會被封存）」。

理由：第一輪只有一條階梯，同時開好幾個同樣的題目沒有意義，且會讓歷史紀錄頁很亂。

### 11.5 續跑與封存的區別

- **未結束的 session 可以續跑** — 關掉瀏覽器、隔天回來，接著上次繼續。這在此架構下幾乎免費（狀態與訊息都在 DB），且少了它，demo 時重新整理一下就全沒了
- **已結束的 session 封存唯讀** — 想再跑就開新 session

未來若要「看過總結之後再繼續」，採**續篇 session**而非重開舊 session：開新 session，繼承上次脈絡（引用舊總結、標記從第幾階接續），產生自己的新總結。理由：學生讀過那面鏡子後的回答會被它牽引，那份總結就不再對應一段乾淨的對話。續篇形式讓每份總結各自對應一段完整對話，而「你上次說 X，這次說 Y」的對照反而被保留下來。

### 11.6 前端可替換性

**整份前端是可以整個換掉的，而且很便宜。** 原因不在前端，在後端：所有流程狀態都由 Orchestrator 持有，`SessionView` ＋ `available_actions` 已經是「該畫什麼」的完整描述。

一個全新的客戶端——重新設計的視覺風格、3D 場景、甚至不是 React 的實作——只要消費同一份契約就能運作，**後端零改動**。

| 重寫的 | 不必重寫的 |
|---|---|
| 版面、樣式、互動 | 流程邏輯（前端本來就沒有） |
| | 狀態管理（只有一個 `SessionView`） |
| | API 型別（由 OpenAPI 產生） |

#### 維持這個性質的三個條件

1. **不導入設計系統或元件庫。** 第一輪用純 CSS 不是將就——導入 Mantine／MUI 之後，要換風格就得先把它的版面原語從每個檔案拆出來，重做前面多一道拆除工程
2. **元件邊界照領域切，不照視覺切。** `MessageList`／`ActionBar`／`ProgressIndicator` 是按「這塊資料是什麼」切的，換皮時可以逐個替換甚至保留。若把 fetch、狀態、訊息、按鈕、進度全混在一個頁面元件裡，重做就只能整個丟掉
3. **任何流程判斷都不得進前端**（§9.1）。一旦前端開始自己由 `flow_state` 推導東西，那段邏輯就得在每個新客戶端重寫一次

#### 未來重做（例如遊戲感的視覺、3D 角色）的兩個前置條件

**一、串流會從「體驗優化」升格為必要。** §2 目前把 SSE 列為可延後，但一個會說話的 3D 角色若張嘴瞬間吐出整段文字，看起來就是壞的——它需要文字隨時間到達。接縫已留好（§9.3，同一端點換傳輸層），但做 3D 的那一輪必須**先**完成串流，不能再往後排。

**二、§4 的教學設計決策必須逐條存活。** 技術上換前端很便宜，但視覺風格會帶著自己的慣例進來。最需要盯的是**關卡地圖／選單**——遊戲介面幾乎一定會想畫一張「接下來有哪些關」的圖，而那是 §4.1 不劇透規則的正面違反，也是整個產品最重要的一條規則。

**那一輪的第一件事不是挑 3D 引擎，是把 §4 的六條攤開逐條確認新的互動模型沒有違反。**

### 11.7 Local 身分的代價

清掉瀏覽器資料或換一台電腦，歷史就找不回來。這是 local 身分的固有性質，第一輪接受。**團隊測試前須先說明**，否則會被當成 bug。

---

## 12. ScriptedProvider

腳本檔描述「每一階的每一輪，教授說什麼 + 回報什麼 observations」：

```yaml
stage: trolley_basic
turns:
  - reply: "所以你會轉向。為什麼？"
    observations: { has_position: true,  has_reason: false, reason_tested: false, principle_label: 未明 }
  - reply: "一命換五命 — 你用的是數量。那如果…"
    observations: { has_position: true,  has_reason: true,  reason_tested: false, principle_label: 後果主義 }
  - reply: "你堅持這個原則。我們換個情境。"
    observations: { has_position: true,  has_reason: true,  reason_tested: true,  principle_label: 後果主義 }
```

**腳本只看「第幾輪」，不看學生打了什麼** — 行為百分之百可重現，這正是本輪驗收要的。代價是學生打什麼都一樣；團隊試玩若想要真實反應，切換到真 provider。

**每一條流程分支都要有對應的腳本**：正常走完三階一份，另外分別驅動 `capped`（觀察值永遠不齊）、`position_shifted`（中途翻轉）等分支。這樣每個狀態轉換在驗收時都能實際走過一次，不是只有單元測試覆蓋。

### Provider 回傳契約

```jsonc
TutorTurn {
  "reply_text": "…",
  "observations": {
    "has_position": bool,
    "has_reason": bool,
    "reason_tested": bool,
    "principle_label": "後果主義|義務論|混合|未明",
    "position_shifted": bool
  }
}
```

**Provider 只回報觀察，不回報「是否達成」。** 判準由 `StageAdvancePolicy` 套用。若讓模型直接說「達成了」，規則就藏在模型裡：不可驗證、換家模型就變、要調整得改 prompt。

---

## 13. 測試策略與驗收

### 13.1 TDD 順序

每個 task 都是「先寫測試 → 看它失敗 → 實作」。**特別要避免先把 Orchestrator 寫出來再補測試** — 那樣寫出來的測試只會描述程式碼已有的行為，測不到真正想保證的判準。Orchestrator 的狀態轉換表應在實作之前就以測試的形式存在。

### 13.2 分層

> 本節六層之中，符合「違反會壞掉產品、AI 預設就會違反、而且擋得住」三條件的測試，實體檔案另外集中於 `tests/invariants/` 並受 CODEOWNERS 保護——見協作設計 §6.0 與 §6.2。分層不變，只是換目錄存放。

**第一層 · Orchestrator 單元測試（重心）**
假 gateway（直接餵 observations）+ 假 repository，毫秒級，無需 DB 或 LLM。

- 第一輪永遠不可能達成（`reason_tested` 天然為 false）
- 三條件齊備 → 進路口
- `position_shifted` 為真時否決推進，即使三條件齊備
- 輪數達上限且未達成 → `capped`，不是 `goal_met`
- 路口 advance → 下一階 `in_progress`，開場白逐字等於定義檔
- 最後一階達成 → `awaiting_wrap_up`；學生繼續講 → 追加輪；追加上限到 → 強制收尾
- 任何未結束狀態按結束 → `ended`；當前 `in_progress` 階標 `stopped_early`，未走到的階標 `skipped`
- `ended` 之後任何動作一律拒絕

**第二層 · StageAdvancePolicy 純函式**
三個布林的真值表窮舉。之後調整判準，這張表就是回歸測試。

**第三層 · TutorGateway**
假 provider：格式壞掉被 post-processor 擋下、自動重試一次、observations 缺欄位視為失敗。

**第四層 · API 契約測試**（TestClient + ScriptedProvider + 測試資料庫）
- `available_actions` 隨狀態變化
- **未進入的階段，回應中不含 title** ← 獨立一條，守的是不劇透的保證
- provider 失敗時學生訊息仍在資料庫，`retry` 能接上
- 帶別人的 `X-Learner-Id` 取不到 session（403）

**第五層 · 前端**
只測「同一份 SessionView 進來，該出現的按鈕有出現」— 尤其路口時輸入框鎖住、結束鈕的確認對話框。

**第六層 · LadderRepository**
壞掉的 yaml 讓服務啟動失敗。

### 13.3 人工驗收腳本

環境：`docker-compose up` 起 postgres，後端以 `PROVIDER=scripted` 啟動。

1. 首次進入 → 開始討論 → 第一階開場白出現，進度顯示「情境 1 / 3」
2. 對話三輪 → 路口出現，提示「還有 2 個情境」，**且畫面上任何地方都沒有「天橋」字樣**
3. 進入第二階 → 標題此時才揭露
4. **重新整理瀏覽器** → 回到同一個位置，對話完整
5. 進入第二階、尚未達成且未到上限時按「結束討論」→ 確認對話框 → 總結頁顯示「整理中」→ 出現一句話總結，第二階標記為「中途結束」，第三階標記為「沒有走到」
6. 回歷史紀錄 → 這筆在列表上 → 點進去回到總結
7. 開新 session → 走完三階 → 教授主動提議收尾
8. 用 capped 腳本重跑 → 第一階標記為「還沒有定見」，與「沒有走到」在畫面上看得出差別
9. 故意讓 provider 失敗 → 學生訊息還在 → 重試成功接上

**九步全通 = 本輪通過。** 此腳本須寫入文件，團隊多人測試需要同一套步驟。

> **執行時機**：這份腳本要等學生端流程補完之後才跑得通。核心組的垂直切片刻意不實作第二三階、路口、`capped`／`stopped_early`／`skipped` 分支，因此切片完成時第 2、3、5、6、7、8 步必然失敗——這是預期的，不是缺陷。Round 1 驗收時，切片暫列為 `xfail`／`skip` 的狀態轉換測試也必須全部啟用並通過。兩道關卡的區別見協作設計 §5.2。

---

## 14. 技術選型

| 層 | 選擇 |
|---|---|
| 前端 | React |
| 後端 | FastAPI |
| 資料庫 | PostgreSQL |
| LLM | Provider 抽象，可自由切換供應商。第一輪以 ScriptedProvider 驗收 |
| 開發環境 | **docker-compose 涵蓋全棧**（前端 + 後端 + postgres），`docker-compose up` 即可跑完整對話 |
| repo 形態 | 單一 repo（前後端同 repo），public。目錄結構見協作設計 §5.3 |
| 前端 | Vite + React Router + Vitest／RTL + 純 CSS，不用元件庫。見 §11.0 |

**全棧 compose 的理由**：原本只規劃把 postgres 容器化、前後端本機跑。但團隊規模為 15 人環境各異，這個取捨反過來了——寫 compose 是一次性成本，而 15 個人各自 debug 本機 Python／Node 環境的成本會在整個學期反覆發生，且會消耗核心組最寶貴的時間。`docs/onboarding.md` 的第 2 步（剛進來看專案第一件事就是實際走一次對話）也依賴這一點。

---

## 15. 未決事項

- 免費 LLM 供應商尚未指定。Provider 介面需容納「不支援 system prompt」「不支援 structured output」等能力差異
- 總結的中文文案風格（教授口吻 vs 中性分析）未定，實作時提案
- 蘇格拉底頭像的素材來源未定
- **教授的「修辭動作」欄位（`move`）**：`observations` 描述的是學生（表態了嗎、理據被測試了嗎），沒有任何欄位描述教授這一手在做什麼（逼問／讓步／統整／收尾）。3D 角色或語音要做表情與語氣變化時會需要它，屆時在 provider 契約加一個列舉欄位即可。**現在刻意不加**：目前沒有需求，而且晚加不痛——舊對話缺少表情資料無妨，不會拿半年前的逐字稿重播動畫。做 3D／語音那一輪要先補

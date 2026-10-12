# 課堂與分組課堂的狀態轉移

本文件依目前程式整理課堂（classroom run）與分組課堂（group run）的階段（`phase`）轉移，只描述現況
（issue #13）。來源：

- `backend/app/orchestrator/classroom.py`：`GameOrchestrator`（全班課堂的原生狀態機）。
- `backend/app/domain/group_run.py`：`extend()` 包裝出的 `GroupOrchestrator`（個人對話、觀點確認與結算）。
- `backend/app/services/ai_students.py`：`extend()` 包裝出的 AI 學生排程與全 AI 課堂加速。
- `backend/app/orchestrator/policy.py`：推進判準 `should_advance`（唯一修改點）。
- `backend/app/services/classroom.py`：`execute`（指令）、`tick_due`（計時器）、`view`（全班檢視與可用動作）。
- `backend/app/api/routes/groups.py`：分組的建立、開始、分組檢視與分組指令。

各 LLM 工作的輸出結構見 [LLM-OUTPUT-SCHEMA.md](LLM-OUTPUT-SCHEMA.md)，劇本欄位見
[SCRIPT-SCHEMA.md](SCRIPT-SCHEMA.md)。

## 時間與驅動方式

- 每個課堂只有一個 `phase`，由伺服器決定；所有時間由伺服器注入（`GameOrchestrator(state, now)`）。
- `phase(name, seconds)` 會把 `deadline_at` 與 `due_at` 設為 `now + seconds`；`seconds` 為 `None` 時兩者皆為
  `None`，表示**沒有計時器**，只能由指令或 LLM 工作完成來推進。
- 背景的 `tick_due` 會找出 `due_at <= now` 的課堂並呼叫 `tick()`；下表的「計時」都是經由它觸發。
- 教師的「下一步」是指令 `next`（`teacher=True`）。學生送出 `next` 會得到 `TEACHER_MEMBERSHIP_REQUIRED`。
- LLM 工作在交易提交後由 worker 執行，完成時呼叫 `complete_job()`；沒有可用 LLM 時改以固定內容完成
  （`services/llm_workers.py` 的 `deterministic_result`），導師類工作則是「暫停」訊號。

## 推進判準（結束條件）

issue #13 的結束條件是「**能判定學生目前的立場**」（規格 R2）。程式中它只有一個實作：
`orchestrator/policy.py` 的 `should_advance(obs, turn_count)`，課堂經 `classroom_policy.stage_goal` 呼叫：

```
completed_turns >= 1  AND  not position_shifted  AND  has_position  AND  has_reason  AND  reason_tested
```

- 地板：至少已完成 1 個「導師追問 → 學生回應」來回；第一則導師訊息是開場追問，不算來回。
- 三條件與否決規則見設計規格 §4.3／§4.4；觀察由 LLM 回報（`Observations`），**是否結束只由此判準決定**。
- 判準先於上限：同一輪達成判準又碰到上限，算達成；只碰到上限則是 `capped`。
- 用在兩處：代表討論（`focus`，達成時以 `goal_met` 結束該代表）與分組課堂的個人對話（達成時進入
  `awaiting_confirm`，由學生確認摘要後成為基準）。
- **詳細定義屬 issue #19，仍待小組確認。** 個人對話的預設值（`max_personal_turns` 6 回合、
  `personal_seconds` 600 秒）也待團隊確認，目前老師可逐題調整。

## 全班課堂（`GameOrchestrator`）

| 階段 | 進入方式 | 計時 | 結束條件（觸發者） | 下一階段 |
|---|---|---|---|---|
| `lobby` | 建立課堂（`fresh_state`） | 無 | 教師 `start`（附劇本快照） | `countdown` |
| `countdown` | `start` | 3 秒 | 計時 | `answering`（第 1 題） |
| `answering` | `start_question` | `duration_seconds`；`due_at` 另加 0.1 秒寬限 | 計時到期後 `tick` 執行 `finalize`；教師 `next` 把截止時間提前到現在（事件 `answer.closing`），仍由下一次 `tick` 結算。**全員作答完畢不會提前結束** | `distribution` |
| `distribution` | `finalize`：截止前的有效草稿（選項合法，且有理由或該題不要求理由）轉為作答，計算全班分布 | 5 秒 | 計時或教師 `next`，執行 `next_focus` | `focus` 或本題結束 |
| `focus` | `next_focus` 選出某選項的代表 | 導師生成中無計時；導師回覆後等待代表回應 `focus_response_seconds` | 導師回覆後依序判斷：代表離線（超過 30 秒未出現，換人重選）、教師先前已按 `next`、達成推進判準（`goal_met`）、達到 `max_focus_turns`（`capped`）；否則等代表回應。回應時限到期（`response_window_complete`）或教師 `next`（生成中則延到回覆後）也會結束。導師暫停（`TUTOR_UNAVAILABLE`）時無計時，等教師 `next` | `focus_summary` |
| `focus_summary` | `close_focus` | 3 秒 | 計時或教師 `next`，執行 `next_focus` | 下一位代表的 `focus`，或本題結束 |
| `question_summary` | 動態模式且已進行題數 `< max_questions`；同時排入 `dynamic_question` 工作 | 無 | `dynamic_question` 工作完成；教師 `next` 在此階段回 `CURRENT_PHASE_ACTIONS` | `preview` |
| `preview` | 下一題產生完成 | `preview_seconds` | 計時、教師 `next` 或 `approve_question` 採用（`accept_preview`）；`regenerate_question` 重新產生 | `answering`（下一題）；重新產生時回 `question_summary` |
| `summary` | 最後一題結束（全班課堂） | 無 | 終點 | — |

### 代表選擇與「本題結束」

- `next_focus` 依劇本選項順序處理尚未處理過的選項：從選了該選項、理由非空、未被排除、30 秒內在線的學生中，
  挑被選次數最少者（同分隨機），每個選項至多一位代表。沒有合格人選的選項直接略過。
- 候選作答來自 `representative_answers()`：全班課堂是全部作答；分組課堂**只有已確認的基準**
  （`baseline_answers`，代表的論點是基準的 `reason_summary`）。
- 所有選項處理完即「本題結束」（`finish_question`），排入本題摘要工作，然後：
  - 靜態模式還有下一題：直接進入下一題的 `answering`（不再倒數）。
  - 動態模式且題數未達 `max_questions`：進入 `question_summary`。
  - 否則：全班課堂進入 `summary`；分組課堂改走下方的 `viewpoint_review`。
- 代表討論期間，題目的 `run["phase"]` 標為 `arena`，但課堂的 `phase` 仍是
  `distribution`／`focus`／`focus_summary`（見「已知落差」）。

## 分組課堂（`GroupOrchestrator`）

### 母教室（parent room）

| 階段 | 結束條件（觸發者） | 下一階段 |
|---|---|---|
| `lobby` | 教師 `POST /groups/classrooms/{rid}/configure` 儲存分組（可重複），再 `POST .../start` 開課 | `group_overview` |
| `group_overview` | 終點；母教室本身不再計時，教師在此看各組進度、批次對各組送 `next` | — |

`start` 為每個有人的組別建立一個獨立的 group run（共用同一份劇本快照），立刻對它執行 `start`，
所以 group run 一開始就在 `countdown`，不會停在 `lobby`。

### Group run 的階段

每題的順序：`answering → personal → distribution → focus → focus_summary → …（每個有基準的選項一位代表）`；
最後一題結束後：`viewpoint_review → final_reflection → summary`。group run 沿用全班課堂的全部階段與規則，
另有以下階段與差異：

| 階段 | 進入方式 | 計時 | 結束條件（觸發者） | 下一階段 |
|---|---|---|---|---|
| `answering` | 同全班課堂 | 同全班課堂 | 同全班課堂。差異：作答一被接受（學生 `answer`，或截止時 `finalize` 收下草稿），就開始該生自己的個人對話（見下節），作答時間內即可進行 | `personal`；截止時每位作答者的個人對話都已有結果（`confirmed`／`unclear`／`capped`）則直接 `distribution` |
| `personal` | `finalize` 時仍有個人對話未有結果 | 題目的 `personal_seconds` | 三者之一：每位作答者都有結果（`all_settled`，每次個人指令或導師回覆後檢查）、教師 `next`（`teacher_next`）、計時到期（`deadline`）。關閉時未有結果者標為 `incomplete` | `distribution` |
| `distribution` | `close_personal` 或 `finalize` 呼叫 `open_distribution` | 5 秒 | 同全班課堂 | `focus` 或本題結束 |
| `viewpoint_review` | 最後一題結束、原本要進 `summary`，且結算狀態仍是 `EXPLORING` | 無 | 全組（`member_snapshot` 每一位）都完成 `group_ack` → 結算狀態轉為 `CURRENT_PHASE_FINISHING`，並設 30 秒後到期；到期或教師 `next` 即離開。結算狀態仍是 `EXPLORING` 時，教師 `next` 會被接受但**不改變任何狀態** | `final_reflection` |
| `final_reflection` | 從 `CURRENT_PHASE_FINISHING` 換階段時，一律改進入此階段（結算狀態 `FINAL_STAGE`） | 60 秒 | 計時或教師 `next`，執行 `settle` | `summary` |
| `summary` | `settle`：結算狀態 `SETTLED`，寫入固定的全班摘要（各成員最後確認的原話） | 無 | 終點 | — |

分布（`distribution`）只計已確認的基準：`run["distribution_basis"] = "personal_baseline"`；
有作答但沒有基準的人數記在 `run["distribution_excluded"]`，沒作答的人兩者都不計。

結算狀態（`group.settlement.state`）：`EXPLORING` → `CURRENT_PHASE_FINISHING`（全員確認）→
`FINAL_STAGE`（進入 `final_reflection`）→ `SETTLED`（`settle`）。

其他差異：

- 最後一題結束時，原生 `finish_question` 中「進入 `summary` 後」的步驟（`closed_at`、
  `classroom_complete` 成就、全班摘要工作）不會執行；`closed_at` 與全班摘要改由 `settle` 寫入。

### 個人對話：每位學生的狀態

存在 `run["personal"][member_id]`，每題一份；沒作答的學生沒有這一筆（進度中算 `not_answered`）。

| 狀態 | 進入方式 | 離開方式 | 產生基準 |
|---|---|---|---|
| `probing` | 作答被接受（真人學生），排入第一個 `personal_tutor` 工作；學生 `personal_message`／`personal_revise`、`personal_retry` 也回到此狀態並排入下一個工作 | 導師回覆後：達成推進判準 → `awaiting_confirm`；`completed_turns` 達 `max_personal_turns` → `capped`；否則留在 `probing` 等學生回覆。LLM 不可用 → `unavailable` | 否 |
| `awaiting_confirm` | 導師回覆且達成推進判準；附候選摘要與 `summary_digest` | 學生 `personal_confirm`（帶目前的 `summary_digest`）→ `confirmed`；`personal_revise`（舊摘要作廢）→ `probing`；`personal_unclear` → `unclear` | 否 |
| `confirmed` | 學生確認摘要；AI 學生作答即直接進入（`baseline.source: "ai_student"`） | 終態 | **是**：`baseline` = 作答的 `option_id` ＋ 摘要的立場、理由、條件 |
| `unclear` | 學生在待確認時選「暫時無法釐清」 | 終態 | 否 |
| `capped` | 達回覆上限仍未達成判準（判準先於上限） | 終態 | 否 |
| `unavailable` | `personal_tutor` 的結果是 `tutor_unavailable`（學生訊息已保存） | 學生或教師 `personal_retry` → `probing`（同一回合重送） | 否 |
| `incomplete` | 個人對話關閉時仍是 `probing`／`awaiting_confirm`／`unavailable`（記錄 `status_at_close`、`end_reason`） | 終態 | 否 |

`confirmed`、`unclear`、`capped` 是「已有結果」（`PERSONAL_TERMINAL`）；`personal` 階段要等全部作答者都有結果
才會自行結束。個人對話開放的範圍是 `answering` 與 `personal` 階段、且本題尚未關閉（`personal_open`）；
關閉後任何個人指令都回 `PERSONAL_WINDOW_CLOSED`。導師輸出與對話原文只給該生本人，教師只看到狀態、
摘要與基準。

## 學生可用的指令

分組學生畫面的按鈕只依後端清單顯示，前端不由階段推導。分組檢視（`GET /groups/classrooms/{id}`）的
`available_actions` 由 `group_run.student_actions` 計算；學生在多人階段看到的全班畫面則用全班檢視
（`GET /classrooms/{id}`）的 `available_actions`（`services/classroom.py` 的 `view`）。

| 指令 | 送往 | 列入可用動作的條件 |
|---|---|---|
| `draft`、`answer` | `POST /classrooms/{id}/commands` | `answering`，且本題尚未作答（兩份清單都有）。後端另檢查在 `deadline_at + 0.1` 秒內、`option_id` 是本題選項、`argument_required` 時理由不可空白。分組課堂中附理由的 `answer` 也會存成一則原話 |
| `personal_message` | `POST /groups/runs/{id}/commands` | 個人對話開放中，自己的狀態是 `probing` 且導師不在生成中 |
| `personal_confirm`、`personal_revise`、`personal_unclear` | 同上 | 個人對話開放中，自己的狀態是 `awaiting_confirm` |
| `personal_retry` | 同上 | 個人對話開放中，自己的狀態是 `unavailable`（教師可帶 `data.member_id` 代為重試，見教師檢視每列的 `actions`） |
| `group_statement`（原話） | 同上 | 階段屬於 `TALK_PHASES`：`answering`、`distribution`、`focus`、`focus_summary`、`question_summary`、`preview`、`viewpoint_review`、`final_reflection`（`countdown`、`personal`、`summary` 不行），且尚未 `SETTLED` |
| `group_ack`（確認觀點） | 同上 | 只在 `CONFIRM_PHASES`：`viewpoint_review`、`final_reflection`；尚未確認，且自己至少有一則原話。送上的 `summary_digest` 須等於目前的個人原話摘要；已確認者重送會回傳原紀錄 |
| `focus_message` | `POST /classrooms/{id}/commands` | 全班檢視：`focus`，自己是目前代表且導師已回覆（`AWAITING_STUDENT`）；分組課堂中同時存成一則公開原話 |
| `barrage`（彈幕） | `POST /classrooms/{id}/commands` | 全班檢視：`focus`、`focus_summary` |
| `reaction`（回饋） | `POST /classrooms/{id}/reactions` | 全班檢視：僅 `focus` |
| `personal_summary`（課後個人摘要） | `POST /classrooms/{id}/commands` | 全班檢視：`summary` |

教師指令：`start`（`lobby`）、`next`（見各表；`countdown`、`question_summary`、`summary` 回
`CURRENT_PHASE_ACTIONS`）、`end`（分組課堂尚未結算時，教師強制結束並把未確認成員標成
`incomplete`）、`approve_question`／`regenerate_question`（`preview`）、`personal_retry`
（帶 `data.member_id`）。

### 全 AI 課堂加速

組內全部成員都是 AI 學生時，凡有計時的階段，時限改為「原時限」與「`CLASSROOM_AI_<PHASE>_SECONDS`
（未設定時用 `CLASSROOM_AI_PHASE_SECONDS`，再沒有則用內建值：`countdown` 2、`answering` 45、
`distribution` 2、`focus_summary` 2、`preview` 2、`final_reflection` 45，其餘 5 秒）」中較短者，最短 0.25 秒。
沒有計時器的階段（例如 `focus`、`viewpoint_review`）不受影響。AI 學生作答即有基準，所以全 AI 的組不會進入
`personal`。

## 待決

- **推進判準的詳細定義（issue #19）仍待小組確認**；目前實作即上方「推進判準」。個人對話預設值
  （6 回合、600 秒）同樣待確認。
- **分組課堂的收尾條件也受 #19 影響。** 現況：學生可在 `viewpoint_review`／`final_reflection`
  送 `group_ack` 保存本人確認；`next` 維持正常推進（`viewpoint_review` → `final_reflection` →
  `summary`）。教師可另送 `end` 強制結束；已確認者保留原話證據，其餘成員在 settlement 中標為
  `incomplete`，結算原因記為 `teacher_force_end`。

## 已知落差

以下保留仍待後續處理的程式行為差額：

- `answering` 中所有作答者的個人對話都已有結果時，仍要等作答時間到（或教師 `next`）才進入 `distribution`。

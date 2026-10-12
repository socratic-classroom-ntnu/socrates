# LLM 結構化輸出（LLM Output Schema）

本文件描述教室每一種 LLM 呼叫**要求模型輸出的 JSON 結構**，以及後端如何使用每個欄位（issue #13）。

- 唯一真實來源是 `backend/app/api/classroom_schemas.py` 的 pydantic 模型；本文件的欄位表、
  每個模型的 JSON 範例與「工作與輸出模型」對照表，由
  `backend/tests/classroom/test_schema_docs.py` 逐欄比對（欄位、型別、必填、預設、限制，以及送給
  provider 的 JSON Schema 的 `required`）。模型、`prompts/classroom/programs.json` 或文件任一邊改了
  而另一邊沒跟上，測試就會失敗。
- 只描述現況；判斷「何時結束、何時推進」的規則不在模型裡，見 [STATE-MACHINE.md](STATE-MACHINE.md)。

## 呼叫流程與驗證

1. 狀態機排入工作（`GameOrchestrator.job(kind, key, context)`），與狀態同一個交易提交。
2. worker 取得工作後由 `tutor/prompts.py` 的 `compile_program` 組出 system prompt（`skills/classroom/socratic.md`
   ＋該工作的 template）與 user 訊息（`context` 的 JSON），並依 `programs.json` 的 `schema` 選出輸出模型
   （`prompts.SCHEMAS`）。啟動時 `validate_programs` 檢查 `JOB_KINDS` 每一種都有 program 且 schema 已知。
3. `tutor/classroom_gateway.generate` 把模型的 `model_json_schema()` 交給 provider：
   `openai`／`openrouter`／`openai-compatible` 用 `response_format.json_schema`（`strict: true`）；
   `anthropic` 把 JSON Schema 附在 system prompt 後；`gemini` 用 `generationConfig.responseSchema`。
4. 回覆一律以 `schema.model_validate_json(...)` 驗證後 `model_dump()`：**不符合模型就是失敗的回覆**，
   不會被部分採用。失敗記入 call audit，改試下一個 provider profile；全部失敗時改用固定內容
   （`services/llm_workers.py` 的 `deterministic_result`，見各節「無 LLM 時」）。
5. 驗證後的結果交給 `GameOrchestrator.complete_job(kind, key, result, provider)`。過期、重複或不屬於目前
   回合的結果（`job_key` 不符）一律忽略。

每次呼叫的 program metadata 帶 `output_schema_version: "classroom.v1"`。

## 工作與輸出模型

| 工作 | 輸出模型 | provider 角色 | 何時排入 | 結果寫到哪裡 |
|---|---|---|---|---|
| `focused_tutor` | `TutorTurn` | `socratic_tutor` | 代表討論（`focus`）每一輪：選出代表時與代表回覆後 | 該 focus 的 `messages`、`last_observations`、`micro_summary` |
| `personal_tutor` | `PersonalTutorTurn` | `socratic_tutor` | 分組課堂的個人對話：作答被接受時、學生回覆／修正後、重試時 | `run["personal"][member_id]` 的 `messages`、`last_observations`、`summary` |
| `question_summary` | `SummaryResult` | `question_summary` | 每題結束（`finish_question`） | `summaries.questions[題號]` |
| `class_summary` | `SummaryResult` | `class_summary` | 全班課堂進入 `summary` 且逐題摘要都已完成 | `summaries.class` |
| `personal_summary` | `SummaryResult` | `personal_summary` | 學生在 `summary` 階段送 `personal_summary` 指令 | `summaries.personal[member_id 或 member_id:題號]` |
| `dynamic_question` | `DynamicResult` | `dynamic_question` | 動態模式每題結束、題數未達上限；教師 `regenerate_question` | `state.preview`（進入 `preview` 階段） |
| `llm_student_turn` | `LLMStudentTurn` | `ai_student` | AI 學生在 `answering`、輪到自己的 `focus`、`viewpoint_review`、`final_reflection` | 轉成該 AI 學生的 `answer`／`focus_message`／`group_statement`／`group_ack` 指令 |
| `other_suggestion` | `OtherSuggestionResult` | `other_suggestion` | `POST /suggestions/other`（不經工作佇列，請求內直接呼叫） | 直接回給前端，不寫入課堂狀態 |

前七種是 `prompts.JOB_KINDS`，各有 `programs.json` 的 program；`other_suggestion` 的 prompt 寫在
`api/routes/ai_students.py`。provider 角色（`provider_profiles.JOB_ROLE`）決定使用帳號 AI 設定裡哪個模型。

`ai_script_authoring`（AI 協助出題）不經工作佇列：`POST /scripts/assist` 在請求內直接呼叫，program 在 `programs.json`（`prompts.REQUEST_PROGRAMS`），輸出模型是下方的 `ScriptAssistResult`，後端再組成完整題目放進教師尚未存檔的草稿。

### 個人對話的 `PersonalSummary` 與 `personal_summary` 工作不同

`PersonalSummary` 是 `personal_tutor` 每一輪附帶的候選立場摘要（學生可確認成基準）；`personal_summary`
工作則是課後依學生要求產生的回顧文字，輸出是 `SummaryResult`。兩者名稱相近，內容與用途無關。

## 共通規則

- 所有模型繼承 `Strict`（`extra="forbid"`）：**多出表內沒有的欄位，整份回覆就驗證失敗**。
- 「必填」為「是」的欄位缺少時驗證失敗；其餘欄位省略時套用「預設」。送給 provider 的 JSON Schema 中，
  `required` 正好是「必填」為「是」的欄位。
- `Observations` 的每個欄位都必填：少一個就是失敗的回覆，不會被當成「未達成」（設計規格 §13.2 第 3 層）。
- 模型只回報觀察，**不回報「是否達成」**；是否結束由後端 policy 判斷（見〈結束判準〉）。

## 欄位表

### `TutorTurn`

`focused_tutor` 的輸出：導師對目前代表的一則回覆。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `reply_text` | `string` | 是 | — | `min_length=1`、`max_length=16000` | 導師對代表說的話；附在 focus 的 `messages`，以 `tutor.final` 事件送到教室。 |
| `observations` | `Observations` | 是 | — | — | 本輪觀察；存進該則訊息與 `last_observations`，交給 `stage_goal` 判斷是否結束這位代表的討論。 |
| `move` | `enum(probe, clarify, challenge, reflect, summarize)` | 否 | `"probe"` | — | 這則回覆的追問方式，只記錄在訊息上，不影響流程。 |
| `micro_summary` | `string` | 否 | `""` | — | 目前論點的精簡整理；每輪覆寫，結束該代表時作為小結（空字串時改用「本次討論以此論點展開：」加論點前 300 字）。 |

```json
{
  "reply_text": "你說先到的人承擔了等待的成本。如果有人因為臨時急診才晚到，你還會這樣判斷嗎？",
  "observations": {
    "has_position": true,
    "has_reason": true,
    "reason_tested": false,
    "position_shifted": false,
    "principle_label": "義務論"
  },
  "move": "challenge",
  "micro_summary": "主張先到先取，理由是等待者已付出成本。"
}
```

### `Observations`

`TutorTurn` 與 `PersonalTutorTurn` 共用的觀察欄位，對應設計規格 §4.3 的三條件與 §4.4 的否決規則。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `has_position` | `boolean` | 是 | — | — | 學生是否對情境做出選擇（表態）。 |
| `has_reason` | `boolean` | 是 | — | — | 學生是否說得出可命名的理由。 |
| `reason_tested` | `boolean` | 是 | — | — | 理由是否已被追問測試過、且學生回應了（「我說不上來」也算）。 |
| `position_shifted` | `boolean` | 是 | — | — | 學生是否在這一輪改變了立場；為真時本輪不得結束。 |
| `principle_label` | `enum(後果主義, 義務論, 混合, 未明)` | 是 | — | — | 學生理由的原則類型，只供記錄與分析，不影響流程。 |

```json
{
  "has_position": true,
  "has_reason": true,
  "reason_tested": true,
  "position_shifted": false,
  "principle_label": "混合"
}
```

### `PersonalTutorTurn`

`personal_tutor` 的輸出：分組課堂中，導師對**一位學生**的個人追問，附上對該生目前立場的候選摘要。
輸出只屬於這位學生：不經教室頻道串流（`llm_workers.PRIVATE_JOB_KINDS`），其他學生看不到，教師只看得到
狀態、摘要與基準，看不到對話原文。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `reply_text` | `string` | 是 | — | `min_length=1`、`max_length=16000` | 導師對這位學生說的話；附在個人對話的 `messages`。 |
| `observations` | `Observations` | 是 | — | — | 本輪觀察；存進該則訊息與 `last_observations`，交給 `stage_goal` 判斷能否進入待確認。 |
| `move` | `enum(probe, clarify, challenge, reflect, summarize)` | 否 | `"probe"` | — | 這則回覆的追問方式，只記錄在訊息上。 |
| `summary` | `PersonalSummary` | 是 | — | — | 依目前對話整理的候選摘要；每輪覆寫 `summary`。進入 `awaiting_confirm` 時連同 `summary_digest` 給學生確認，確認後成為基準（`baseline`）。 |

```json
{
  "reply_text": "你提到「沒有緊急需求時」才先到先取。那由誰來判斷什麼算緊急？",
  "observations": {
    "has_position": true,
    "has_reason": true,
    "reason_tested": true,
    "position_shifted": false,
    "principle_label": "混合"
  },
  "move": "probe",
  "summary": {
    "current_position": "原則上先到先取，但緊急需求可以優先",
    "reason_summary": "先到的人承擔了等待的成本，打破順序要有更強的理由",
    "relevant_conditions": ["沒有緊急需求時"],
    "unresolved_issue": "誰有權認定緊急"
  }
}
```

### `PersonalSummary`

`PersonalTutorTurn.summary`：模型對學生目前立場的**候選解讀**，只用學生自己說過的內容。後端以
`group_run.personal_summary_value` 正規化（去除前後空白、刪掉空白條件、條件最多 12 條）後保存。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `current_position` | `string` | 是 | — | `min_length=1`、`max_length=2000` | 學生對原題的目前主張，可含條件或不確定；確認後成為 `baseline.position`。 |
| `reason_summary` | `string` | 是 | — | `min_length=1`、`max_length=4000` | 主要理由；確認後成為 `baseline.reason_summary`，也是之後代表討論時採用的論點。 |
| `relevant_conditions` | `array<string>` | 否 | `[]` | `max_length=12` | 學生提到會影響判斷的條件；確認後成為 `baseline.conditions`。 |
| `unresolved_issue` | `string` | 否 | `""` | `max_length=2000` | 尚未釐清之處；只顯示給學生與教師，不進基準。 |

基準的 `option_id` 一律取學生原本作答的選項，**不由模型決定**；模型無法改變學生在分布中的位置。

```json
{
  "current_position": "選擇先到先取",
  "reason_summary": "先到的人承擔了等待的成本",
  "relevant_conditions": [],
  "unresolved_issue": ""
}
```

### `SummaryResult`

`question_summary`、`class_summary`、`personal_summary` 共用的摘要輸出。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `text` | `string` | 是 | — | `min_length=1`、`max_length=20000` | 摘要本文；以 `{"status": "READY", "text", "key_points", "provenance"}` 寫入對應的 `summaries` 位置。 |
| `key_points` | `array<string>` | 否 | `[]` | — | 條列重點。 |

各工作的輸入：`question_summary` 收到題目、全部作答、代表討論與分布；`class_summary` 收到逐題摘要與
教室標題；`personal_summary` 只收到該生自己的作答與他當代表時的討論。

```json
{
  "text": "本題多數同學支持先到先取，分歧集中在緊急需求是否可以插隊。",
  "key_points": ["共識：等待成本需要被尊重", "分歧：緊急的認定權在誰"]
}
```

### `DynamicResult`

`dynamic_question` 的輸出：下一題。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `question` | `PublicQuestion` | 是 | — | — | 下一題完整內容，結構同 [SCRIPT-SCHEMA.md](SCRIPT-SCHEMA.md) 的 `Question` 但不含 `scenario_ai`（AI 產生的題目不能指定連線）。後端先補「其他」選項（`ensure_other_question`）再以 `Question` 驗證，放進 `preview` 等教師採用或逾時自動採用。 |

輸入（`majority_context`）：剛結束的題目、各選項人數、多數選項，以及多數選項代表的論點、討論與小結。

```json
{
  "question": {
    "id": "q2",
    "title": "資源不足時誰先用？",
    "scenario": "共用器材只剩一台，排隊的人裡有一位明天要考試。",
    "options": [
      {"id": "queue", "text": "維持排隊順序"},
      {"id": "exam", "text": "讓要考試的人先用"}
    ]
  }
}
```

### `LLMStudentTurn`

`llm_student_turn` 的輸出：AI 學生的一個行動提案。後端仍以一般學生指令執行它，同樣受階段與權限檢查。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `action_mode` | `enum(answer, focus, viewpoint, final_reflection)` | 是 | — | — | 模型回報的行動類型。實際執行哪一種由工作的 key（排入時的階段）決定，**不看這個欄位**。 |
| `option_id` | `string` | 否 | `""` | — | 僅 `answer`：選的選項；不是本題選項時改用本題某個選項。 |
| `text` | `string` | 是 | — | `min_length=1`、`max_length=12000` | 作答理由、對導師的回覆或觀點陳述；去除前後空白後為空就不執行。 |
| `relation` | `enum(supports, challenges, qualifies, revises)` | 否 | `"qualifies"` | — | 僅 `viewpoint`／`final_reflection`：存成 `group_statement` 的論點關係。 |
| `should_confirm` | `boolean` | 否 | `true` | — | 僅 `viewpoint`：預設接著送 `group_ack` 確認自己的觀點。 |

AI 學生不經個人對話：作答一被接受，就以作答本身作為基準（`baseline.source: "ai_student"`）。

```json
{
  "action_mode": "answer",
  "option_id": "a",
  "text": "我選先到先取，因為先到的人已經付出了等待的時間。",
  "relation": "qualifies",
  "should_confirm": true
}
```

### `OtherSuggestionResult`

`POST /suggestions/other` 的輸出：學生選「其他」時的一句啟發性建議，學生可自行修改。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `suggestion_text` | `string` | 是 | — | `min_length=1`、`max_length=1000` | 建議文字，原樣回給前端（另附 `suggestion_id`、模型與 provider 等來源資訊）。 |

```json
{
  "suggestion_text": "也許可以從「誰承擔代價」來比較兩個選項。"
}
```

## 無 LLM 時（`deterministic_result`）

所有 provider 都不可用或額度用完時，工作仍會完成，audit 記錄 `fallback_used: true` 與原因：

| 工作 | 結果 | 是否符合輸出模型 |
|---|---|---|
| `focused_tutor` | `{"tutor_unavailable": 原因}`：導師暫停，focus 狀態 `TUTOR_UNAVAILABLE`，等教師 `next` | 否，刻意的暫停訊號 |
| `personal_tutor` | `{"tutor_unavailable": 原因}`：個人對話狀態 `unavailable`，學生訊息已保存，可重試；不會自動完成 | 否，刻意的暫停訊號 |
| `question_summary`／`class_summary`／`personal_summary` | 固定說明文字與兩條重點 | 是（`SummaryResult`） |
| `dynamic_question` | 固定題目「換一個條件，你的選擇會改變嗎？」 | 是（`DynamicResult`） |
| `llm_student_turn` | `ai_students.fallback_turn`：依 persona 與 seed 選一個非「其他」選項並附固定理由 | 是（`LLMStudentTurn`） |
| `other_suggestion` | 固定建議文字（`fallback_other_suggestion`），另附來源欄位 | `suggestion_text` 符合 `OtherSuggestionResult` |

`test_schema_docs.py` 也驗證上表標為「是」的固定內容確實通過對應模型。

## 結束判準

模型輸出的 `observations` 只是證據。「這位學生目前的立場是否已能判定」（規格 R2，issue #13 的結束條件）
由後端唯一的判準 `backend/app/orchestrator/policy.py` 的 `should_advance` 決定（經
`classroom_policy.stage_goal`）：已完成至少 1 個來回（地板），且 `has_position`、`has_reason`、
`reason_tested` 皆為真，且 `position_shifted` 為假。代表討論與個人對話都套用同一個判準，且判準先於上限。
詳細定義屬 issue #19，**仍待小組確認**；各階段如何使用見 [STATE-MACHINE.md](STATE-MACHINE.md)。

## 已知落差

整理時發現、尚未處理的地方：

- OpenAI 相容的 adapter 送出 `strict: true`，但 pydantic 產生的 JSON Schema 把有預設值的欄位（如
  `TutorTurn.move`、`micro_summary`）排除在 `required` 之外，且以 `$defs`／`$ref` 表示巢狀模型。要求
  「所有欄位皆 required」的 strict 實作可能拒絕這份 schema；Gemini 的 `responseSchema` 也未必支援
  `$ref`。無論 provider 端如何處理，後端仍以模型驗證回覆。

### `ScriptAssistResult`

`ai_script_authoring` 的輸出：一題草稿，後端補上題目 id、時間設定與「其他」選項後交給編輯器。

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `title` | `string` | 是 | — | `min_length=1`、`max_length=300` | 題目標題。 |
| `scenario` | `string` | 是 | — | `min_length=1`、`max_length=12000` | 情境敘述。 |
| `options` | `array<string>` | 是 | — | `min_length=2`、`max_length=4` | 選項文字，只描述行為本身。 |
| `tutor_goal` | `string` | 是 | — | `min_length=1`、`max_length=2000` | 導師追問的目標。 |
| `probe_hints` | `array<string>` | 是 | — | `min_length=1`、`max_length=6` | 追問方向。 |
| `rationale` | `string` | 是 | — | `max_length=2000` | 給教師看的設計理由。 |

```json
{
  "title": "共用資源怎麼分",
  "scenario": "宿舍只有一台洗衣機，每週可用時段有限。",
  "options": ["先到先用", "排班輪流"],
  "tutor_goal": "釐清學生判斷公平的原則與例外。",
  "probe_hints": ["什麼情況下你會改變做法？"],
  "rationale": "選項只描述做法，理由留給學生說明。"
}
```

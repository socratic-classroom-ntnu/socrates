# 劇本／題目 JSON 結構（Script Schema）

本文件描述教室劇本（script）與題目（question）的結構化 JSON 契約。唯一真實來源是
`backend/app/api/classroom_schemas.py` 的 pydantic 模型 `ScriptDocument`、`Question`、`Option`；
本文件的欄位表由 `backend/tests/classroom/test_schema_docs.py` 逐欄比對（欄位名稱、型別、
必填與否、預設值、數值／長度限制），模型一改而文件沒跟上，測試就會失敗。

`Question` 也是 LLM 工作 `dynamic_question` 的輸出內容（`DynamicResult.question`），見
[LLM-OUTPUT-SCHEMA.md](LLM-OUTPUT-SCHEMA.md)。

## 在哪裡被驗證

| 進入點 | 位置 | 驗證方式 |
|---|---|---|
| 建立／更新劇本 | `POST /scripts`、`PUT /scripts/{script_id}`（`api/routes/classroom.py`） | 請求本文 `ScriptSave.document` 即 `ScriptDocument` |
| 匯入 YAML | `POST /scripts/import` | YAML 解析後以 `ScriptDocument.model_validate` 驗證；本文上限 256 KB |
| 採用課堂中產生的題目 | `POST /scripts/{script_id}/adopt-question/{room_id}/{index}` | 題目 `id` 改為 `adopted-` 加 10 碼十六進位後附加，整份再以 `ScriptDocument` 驗證 |
| 開始課堂 | `GameOrchestrator.command("start")`（`orchestrator/classroom.py`） | 以快照（snapshot）文件再驗證一次 `ScriptDocument` |
| 動態模式產生的下一題 | `complete_job("dynamic_question")`、`accept_preview` | 以 `Question.model_validate` 驗證 |
| 教室庫附加劇本 | `POST /library/classrooms/{cid}/scripts`（`api/routes/classroom_library.py`） | 直接附上 `document` 時，先補「其他」選項再以 `ScriptDocument.model_validate` 驗證 |

前端 `frontend/src/features/script-builder/validate.ts` 在儲存前做同一套限制的預檢，並把後端 422
錯誤位置換成中文欄位說明；最終判定以後端模型為準。

## 共通規則

- 三個模型都繼承 `Strict`（`model_config = ConfigDict(extra="forbid")`）：**不在表內的欄位一律拒絕**
  （錯誤類型 `extra_forbidden`）。
- 「必填」為「是」的欄位沒有預設值；其餘欄位省略時套用「預設」欄的值。
- 長度限制以字元數計算，且**不先去除前後空白**：例如只含空白的 `title` 會通過後端的 `min_length=1`
  （前端預檢會先 trim 再擋下）。
- 整數欄位採 pydantic 預設的寬鬆轉換：`"90"` 這類可完整轉成整數的字串會被接受並存成整數。

## 欄位表

### `ScriptDocument`

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `title` | `string` | 是 | — | `min_length=1`、`max_length=300` | 劇本名稱，開課後成為教室標題。 |
| `mode` | `enum(static, dynamic)` | 否 | `"static"` | — | `static`：依序使用 `questions` 全部題目。`dynamic`：只用第一題，之後每題由 LLM 依多數選項與代表論點產生，經教師預覽後開始。 |
| `questions` | `array<Question>` | 是 | — | `min_length=1` | 題目清單；`dynamic` 模式只取第 1 題，其餘忽略。 |
| `max_questions` | `integer` | 否 | `3` | `ge=1` | 僅 `dynamic` 模式使用：整堂課最多幾題（含第 1 題）。 |
| `preview_seconds` | `integer` | 否 | `8` | `ge=5`、`le=10` | 僅 `dynamic` 模式使用：產生的下一題在 `preview` 階段停留的秒數，時間到自動採用。 |
| `live_llm_call_budget` | `integer` | 否 | `240` | `ge=0` | 本堂課可呼叫 LLM 的次數上限；`0` 表示不呼叫 LLM。實際上限與帳號 provider 設定的 `max_calls`（大於 0 時）取較小者，AI 學生另有 `CLASSROOM_AI_CALL_BUDGET` 下限（`services/llm_workers.py` 的 `effective_call_limit`）。 |

### `Question`

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `id` | `string` | 是 | — | `min_length=1`、`max_length=64` | 題目識別字。 |
| `title` | `string` | 是 | — | `min_length=1`、`max_length=300` | 題目標題。 |
| `scenario` | `string` | 是 | — | `min_length=1`、`max_length=12000` | 情境敘述。 |
| `options` | `array<Option>` | 是 | — | `min_length=2` | 立場選項，至少 2 個。 |
| `duration_seconds` | `integer` | 否 | `90` | `ge=1` | 作答時間（秒），即 `answering` 階段的倒數。 |
| `argument_required` | `boolean` | 否 | `true` | — | 是否必須附理由：`true` 時空白理由無法送出，截止時只有選項沒有理由的草稿也不會被收為作答。 |
| `tutor_goal` | `string` | 否 | `"協助學生照見自己的立場與理由。"` | — | 導師的目標；隨題目物件送入 `focused_tutor`／`personal_tutor` 工作。 |
| `probe_hints` | `array<string>` | 否 | `["你採用的原則是什麼？條件改變時，你會如何判斷？"]` | — | 給導師參考的追問方向；同樣隨題目物件送入 LLM，不會被當成導師台詞。 |
| `max_focus_turns` | `integer` | 否 | `3` | `ge=1` | 每位代表與導師最多來回幾輪，達到上限即結束該代表的討論（`capped`）。 |
| `focus_response_seconds` | `integer` | 否 | `90` | `ge=5` | 導師回覆後，代表學生回應的時限（秒）。 |
| `sender_point_cap` | `integer` | 否 | `5` | `ge=0` | 代表討論中，送出回饋的同學在同一回合最多可得的積分。 |
| `receiver_point_cap` | `integer` | 否 | `25` | `ge=0` | 代表討論中，被回饋的代表在同一回合最多可得的積分。 |
| `max_personal_turns` | `integer` | 否 | `6` | `ge=1`、`le=20` | 僅分組課堂：每位學生個人對話最多完成幾個來回；達到仍未符合判準即為 `capped`。預設值待團隊確認（見 [STATE-MACHINE.md](STATE-MACHINE.md)〈待決〉）。 |
| `personal_seconds` | `integer` | 否 | `600` | `ge=30` | 僅分組課堂：作答截止後仍有人未有結果時，`personal` 階段的時限（秒）。預設值待團隊確認。 |

### `Option`

| 欄位 | 型別 | 必填 | 預設 | 限制 | 說明 |
|---|---|---|---|---|---|
| `id` | `string` | 是 | — | `min_length=1`、`max_length=64` | 選項識別字；學生作答時以 `option_id` 指向它。 |
| `text` | `string` | 是 | — | `min_length=1`、`max_length=2000` | 選項文字，學生與教師畫面都直接顯示。 |

## 跨欄位規則

- `Question.options` 內的 `id` 必須各自唯一，否則回「選項 id 請各自唯一」（`Question.distinct`）。
- `ScriptDocument.questions` 內的 `id` 必須各自唯一，否則回「題目 id 請各自唯一」（`ScriptDocument.ids`）。

## 伺服器自動補上的內容

- **「其他」選項**：開課建立快照時（`services/ai_students.py` 的 `ensure_other_options`），若某題沒有
  `id` 為 `__other__` 或文字為「其他」的選項，就在最後補上 `{"id": "__other__", "text": "其他"}`。
  動態模式產生的題目同樣經 `ensure_other_question` 補上。經 `/scripts` 建立或更新的劇本本身（`Script.document`）
  不會被改寫；經教室庫直接附上 `document` 建立的劇本則在儲存前就已補上。
- **預設值落地**：驗證後以 `model_dump()` 儲存，所以省略的選填欄位在儲存後會以預設值出現。

## 範例

最小合法文件（其餘欄位取預設值）：

```json
{
  "title": "觀點測試",
  "questions": [
    {
      "id": "q1",
      "title": "如何安排共同資源？",
      "scenario": "請說明你的理由與條件。",
      "options": [{"id": "a", "text": "先到先取"}, {"id": "b", "text": "平均分配"}]
    }
  ]
}
```

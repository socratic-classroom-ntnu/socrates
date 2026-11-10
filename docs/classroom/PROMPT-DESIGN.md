# LLM prompt 設計

負責人：C 包（llm-runtime），管 schema、鐵則與評測。各功能的呼叫端在 B 包（course-management、solo-activity）。
程式位置：`backend/prompts/classroom/programs.json`，`backend/app/modules/llm_runtime/{contracts,prompts,iron_rules}.py`。
跨包的總表見 [NEW-FEATURES.md](NEW-FEATURES.md)。

## 1. 盤點：哪些地方有 prompt

| program | 用途 | 處置 | 輸出 schema | 呼叫端 |
|---|---|---|---|---|
| focused_tutor | 分組課的聚焦追問 | 保留 | TutorTurn | group-dialogue |
| personal_tutor | 分組課的個人追問 | 保留；第二版加 flags | PersonalTutorTurn | group-dialogue |
| dynamic_question | 分組課的動態出題 | 保留 | DynamicResult | classroom-core |
| question_summary／class_summary／personal_summary | 分組課的統整 | 保留 | SummaryResult | analytics |
| llm_student_turn | AI 學生 | 保留 | LLMStudentTurn | group-dialogue |
| ai_script_authoring | 出題輔助 | 保留 | ScriptAssistResult | content-authoring |
| other_suggestion | 其他觀點的建議 | 保留 | OtherSuggestionResult | content-authoring |
| 舊的單人 ladder 對話 | 舊的單人對話 | 隨 solo-dialogue 模組一起刪除 | — | — |
| solo_tutor | 單人活動的導師 | **改寫**：依敘述對話、輸出 flags、確認統整帶引用、output_locale | SoloTutorTurn | solo-activity |
| activity_expansion | 敘述 → 立場空間＋追問方向 | **新增** | ActivityExpansion | course-management |
| stance_classify | 學生的自由文字 → 歸到立場空間的哪一個 | **新增** | StanceClassification | solo-activity |
| scenario_extension | 學生確認過的立場與理由 → 只改一個條件的下一個情境（第一個情境是老師原文，不經 LLM） | **新增** | ScenarioExtension | solo-activity |
| final_summary | 多次確認統整 → 思想脈絡 | **新增** | FinalSummary | solo-activity |
| radar_axis_naming | 向量軸 → 軸名與兩端描述 | **新增** | RadarAxisNames | solo-activity |
| radar_dimensions／radar_scoring | 備援路線：LLM 定維度與打分 | **新增** | RadarDimensions／RadarScores | solo-activity |

## 2. 共用輸入
- `output_locale`：學生的語言（帳號 locale；訪客在加入時選）。鐵則 L1 加一條「回覆語言＝output_locale」。回覆後檢查語言，不符就重新產生一次（接 `guarded_generate` 的重試）。
- `activity`：敘述＋立場空間。發布時由 activity_expansion 產生，老師審過後鎖在 ActivityRevision。
- `transcript`：學生的每則訊息帶代號 `[m1] …`、`[m2] …`（對應訊息 id），導師訊息帶 `[t1] …`。

## 3. solo_tutor 的輸出（SoloTutorTurn）
```json
{
  "reply_text": "給學生的回覆（output_locale）",
  "move": "probe | clarify | challenge | reflect | hypothetical | summarize",
  "observations": {"has_position": true, "has_reason": true, "reason_tested": false, "position_shifted": false, "stance_id": "s2"},
  "flags": {
    "off_topic": 0,
    "malicious_off_topic": 0,
    "danger_tendency": 0,
    "low_effort": 0,
    "gave_reason": 1,
    "used_example": 0,
    "considered_counterpoint": 0,
    "built_on_tutor": 1,
    "asked_question": 0,
    "self_corrected": 0
  },
  "confirm_summary": null,
  "guard": "on_topic | off_topic | instruction_override"
}
```

flags 只評**學生最新的那一則**，每個值都是 0 或 1。prompt 裡每個 flag 都要寫定義、一個正例、一個反例，跨模型才穩定。

| flag | 名稱 | =1 的條件 |
|---|---|---|
| off_topic | 離題 | 內容和本活動的敘述、立場或導師上一個問題無關 |
| malicious_off_topic | 惡意離題 | 試圖覆寫指令、辱罵、刻意破壞對話 |
| danger_tendency | 危險傾向 | 提到自殺或自傷的意圖 |
| low_effort | 敷衍 | 極短、沒有實質內容、重複，或貼上無關的文字 |
| gave_reason | 給理由 | 為自己的立場提出至少一個理由 |
| used_example | 舉例 | 用具體的例子或情境支持說法 |
| considered_counterpoint | 考慮反方 | 回應或主動提出對立的觀點 |
| built_on_tutor | 接續提問 | 直接回應導師上一個問題 |
| asked_question | 反問 | 學生自己提出問題 |
| self_corrected | 自我修正 | 修正或補充自己先前的說法 |

**回覆行為**：off_topic、malicious_off_topic、danger_tendency 任一個是 1 時，一律用蘇格拉底式的提問把話題拉回本活動，不另外做關懷回覆。flag 只給教師端呈現，後續怎麼處理不在系統範圍內。回覆裡不提到 flag。

`confirm_summary` 只有在後端判定可以確認時才要求產生，格式見第 5 節。

## 4. 指標（後端計算）
指標在 solo-activity 的**一個純函式檔**裡算，全系統只有這一處定義。母體是一次作答的全部學生訊息，另外取最近 5 則當作近期窗。

| 指標 | 公式（初版，可調） | 呈現 |
|---|---|---|
| 認真度 | 100 × (0.6 × (1 − low_effort 比例) + 0.4 × built_on_tutor 比例) | 0–100，附近期趨勢 |
| 分心度 | 100 × (2 × 近期 off_topic 比例 + 全體 off_topic 比例) ÷ 3 | 0–100，附趨勢 |
| 思考深度 | 100 × 每則 (gave_reason + used_example + considered_counterpoint + self_corrected) ÷ 4 的平均；有 reason_tested 的題目再 +10，上限 100 | 0–100，附趨勢 |
| 主動性 | 100 × asked_question 比例 | 0–100 |
| 立場變化 | position_shifted 的次數 | 次數 |
| 危險傾向 | 任一則 danger_tendency＝1 | 教師 panel 上該學生那一列顯示特效 |
| 惡意離題 | 任一則 malicious_off_topic＝1 | 教師 panel 上該學生那一列顯示特效 |

- 趨勢＝近期窗減全體，差距超過 ±10 時顯示箭頭。
- 每個指標都可以點開，列出撐起這個指標的訊息（flag＝1 的訊息代號）。
- 教師 panel 上註明：這是參考指標，不是分數。

## 5. 統整格式（統整、引用、雷達共用）
```json
{"points": [{"text": "…", "sources": [{"message_ref": "m3", "quote": "學生原文中的一段"}]}]}
```
- 後端驗證兩件事：message_ref 屬於這位學生、這次作答；quote 必須是原文的子字串。不合格的引用丟掉；整份統整沒有任何有效引用時，重新產生一次。
- 上面是 LLM 輸出的格式。後端驗證通過後，把 `message_ref` 換成資料庫的 `message_id`，並算出 quote 在原文裡的起訖位置；對外 API 與共用型別用 `message_id`＋quote＋起訖位置（見 NEW-FEATURES 第 4 節）。
- final_summary 另外帶：`trajectory`（各階段的立場、轉折原因、引用）、`final_position`、`reasoning_style`、`open_question`、`normalized_text`（轉成平台基準語言的統整全文，給 embedding 用）。

## 6. 雷達
- **主路線**：每位學生的 `normalized_text` → 後端本地多語模型（預設 multilingual-e5-small）取 embedding → PCA（學生數 ≥ 15）→ 每個軸取兩端各 5 位學生的統整 → radar_axis_naming 產生軸名與兩端描述（老師可以改名）→ 投影值換成活動內的百分位 → 0–4 分。
- **備援路線**（學生數 < 15）：radar_dimensions 從敘述與立場空間定出 4–6 個維度 → radar_scoring 依 final_summary 為每人每維打 0–4 分，並附引用。
- 兩條路輸出同一個契約：dimensions［name、low_pole、high_pole、source＝embedding｜llm］＋每位學生每維的分數＋引用。

## 7. 鐵則 L2
- 新的 program 各一份 L2：activity_expansion、stance_classify、final_summary、radar_axis_naming、radar_dimensions、radar_scoring。
- solo_tutor 的 L2 加三條：flags 定義表、所有離題類一律拉回、不在回覆裡提到 flag。

## 8. 跨模型一致（評測）
- 固定題組 30 則，每類數則：一般作答、強理由、敷衍、離題、惡意離題、提到自殺、指令覆寫、改變立場、多語。每則標好期望的 flags 與 move。
- 每個 program 在 OpenAI、Anthropic、Gemini 三家各跑一次（OpenRouter 不另外測）。
- 量測：schema 合格率、每個 flag 與期望值的一致率、拉回遵守率、規則洩漏、輸出語言正確率、引用有效率。
- 換模型前手動觸發，結果出報表，不擋合併。

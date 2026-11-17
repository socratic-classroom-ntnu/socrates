# 給 Courecta：solo_tutor 因 O2 需要的改動

單人 prompt 只由 Courecta 改（`backend/prompts/classroom/programs.json`）。O2 拿掉選項流程之後，solo-activity 送給 `solo_tutor` 的 context 變了，目前的 template 還在讀舊的鍵。這份是需要合進去的改動；O2 的 PR 沒有動 `programs.json`。

## context 的新形狀

| 鍵 | 內容 | 備註 |
|---|---|---|
| `scenario` | 這個情境的原文（第一個情境＝老師唯一輸入框寫的字） | 屬於 `TEACHER_KEYS`，不做指令覆寫偵測。取代原本的 `question`（`title`、`scenario`、`options`） |
| `tutor_goal` | 追問方向 | 老師已經沒有「追問方向」欄位，後端固定給預設值 |
| `answer` | 學生對這個情境的第一個回答，原話 | 取代 `argument`；不再有 `option_id`、`option_text` |
| `history` | 這個情境裡兩人的來回，不含第一個回答 | 不變 |
| `turn_index` | 同上 | 不變，第一則導師訊息是 0 |
| `revise_hint` | 只在學生剛按「不太對」時出現：`stance`、`reason`、`condition`、`changed_mind` | `changed_mind` 現在只是學生用自己的話說「我改變想法了」，沒有新選項 |

拿掉的鍵：`question`、`option_id`、`option_text`、`argument`、`stance_changed_from`。

## template 要改的地方

1. 輸入說明：把「老師的原題 question（tutor_goal…）、學生選的 option_id／option_text、他的第一個理由 argument」改成上表的鍵。
2. 拿掉 `stance_changed_from` 的整段規則。學生換立場靠 `observations.position_shifted`（對照學生自己的上一則訊息）判斷，`changed_mind` 的提示只用來決定這一輪追問「是什麼讓你改變」。
3. 學生沒有選項可選，`observations.has_position` 的意思要改成「學生說出了能被辨認的主張」（TASKS 的 O 段：說出能被辨認的主張）；學生說不清楚時就是 false，導師請他再說一次，不要替他歸類。
4. 「情境」現在是一個序列。`hypothetical` 與「延伸情境」的規則是舊的單題做法；延伸情境由 O5 另外產生並存下來，之後 template 要和它對齊，這一輪先不動。

## 後端這一側已經確定的事

- `PersonalTutorTurn` 與 `should_advance` 沒有動，分組課照舊有選項。
- 訊息上限照舊：每個情境最多 40 則學生訊息，第一個回答也算在內（O7 再處理 capped）。
- 回覆的鐵則檢查、`guarded_generate`、pull-back 句不變。

# Solo Dialogue（單人對話，後端）

一對一 ladder 對話與對話室 view（/api/sessions/*；規格擱置：維持可跑、不加功能）。

## 總結的已進入階段範圍

`ConversationService.generate_summary` 由實際 `stage_progress` 狀態取得
`reached_stage_keys`，經 `TutorGateway` 傳進 `ProviderRequest`；`skipped` 與
`not_started` 的階段留在範圍外。總結 provider 必須使用這個明確範圍，gateway
對範圍外的 `stance_by_stage` 走既有失敗重試／503 路徑，保持資料庫原值。

ScriptedProvider 的全階梯自由文字適用於已進入所有腳本階段的路徑。部分路徑的
核心原則由作者原有的已進入階段 `note` 組成，`tension` 回傳空字串。
新總結的 `raw.reached_stage_keys` 留存生成範圍，API 的 `key_points` 格式維持
「立場：說明」。

總結連續兩次違反鐵則時，`TutorGateway` 拋出 `TutorUnavailable`，API 回傳 503，
資料庫維持原值。第二次產生的合法總結仍可正常儲存。
已存在的 summary 由既有 GET／POST 冪等路徑直接讀取，原始紀錄保持原值。

回歸：`backend/tests/api/test_end_and_summary.py` 驗證部分路徑與既有總結冪等性；
`backend/tests/tutor/test_scripted.py` 驗證全路徑及部分路徑的內容範圍；
`backend/tests/tutor/test_gateway.py` 驗證範圍外立場、鐵則失敗與重試成功。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、llm-runtime、content-authoring

檔案範圍：
- `backend/app/modules/solo_dialogue/`

契約：
- 單人對話（/api/sessions/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

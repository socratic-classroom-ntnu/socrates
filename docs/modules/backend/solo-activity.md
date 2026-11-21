# Solo Activity（單人活動）（後端）

學生在課程活動裡一對一跟蘇格拉底逐題對話：確認、不太對、改變立場、進度與教師統計。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、identity-access、course-management、ai-providers、llm-runtime

檔案範圍：
- `backend/app/modules/solo_activity/`

契約：
- 雷達圖（產生型別 ✅（GET／PATCH /solo/activities/{id}/radar））
- 單人活動（/solo/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

## 雷達圖

- `GET /solo/activities/{id}/radar`（課程擁有者）：只算目前版本、已完成且留有最終統整的作答。
  - 15 人以上且本機 embedding 模型在：`normalized_text` → `ai_providers.embed()` → PCA（最多 5 軸，每軸至少解釋 10% 的差異，不夠的不出）→ 每軸兩端各 5 位的統整交 `radar_axis_naming` 命名 → 標準化投影值換成 0–4（全班平均＝2，每差一個標準差差 1 分，超出的壓在 0 或 4）。這條路沒有引用。
  - 不到 15 人、模型不在、或向量沒有差異：`radar_dimensions` 定 4–6 個維度 → `radar_scoring` 逐人打 0–4 並引用學生原話；引用照最終統整同一組 m1、m2… 代號，找不到原文的丟掉。打不出分的學生不列入。
  - 結果存在 `solo_radars`（每個活動一列），附來源統整的指紋；有統整新增或改變時下一次讀取重算，老師改過的軸名一併重設。
  - 沒有任何留存統整、老師沒有可用的 AI 連線、或模型兩條路都失敗：409 `RADAR_NOT_READY`。
- `PATCH /solo/activities/{id}/radar/dimensions/{index}`：老師改軸名；還沒有雷達時 409 `RADAR_NOT_READY`，index 超出時 404 `RADAR_DIMENSION_NOT_FOUND`。

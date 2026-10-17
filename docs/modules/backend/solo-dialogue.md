# Solo Dialogue（單人對話，後端）

一對一 ladder 對話與對話室 view（/api/sessions/*；規格擱置：維持可跑、不加功能）。

## 總結的已進入階段範圍

`ConversationService.generate_summary` 由實際 `stage_progress` 狀態取得
`reached_stage_keys`，經 `TutorGateway` 傳進 `ProviderRequest`；`skipped` 與
`not_started` 的階段留在範圍外。總結 provider 必須使用這個明確範圍，gateway
對範圍外的 `stance_by_stage` 走既有失敗重試／503 路徑，保持資料庫原值。

ScriptedProvider 的全階梯自由文字只適用於已進入所有腳本階段的路徑。部分路徑的
核心原則由作者原有的已進入階段 `note` 組成；全階梯 `tension` 沒有單階證據，
因此部分路徑回傳空字串。這是腳本資料的 scope 規則，與關鍵詞遮蔽分開。
新總結的 `raw.reached_stage_keys` 留存生成範圍，API 的 `key_points` 格式維持
「立場：說明」。provider 仍使用可重現腳本，教學品質與人類產品驗收各自保留。

已存在的 summary 由既有 GET／POST 冪等路徑直接讀取；本次 Source 修復保留其
原始紀錄。既有紀錄更正需另有綁定 session、preimage 與 correction effect 的正式
入口和收據；部署 Source 或重送原 POST 各自代表不同效果。

回歸：`backend/tests/api/test_end_and_summary.py`、
`backend/tests/tutor/test_scripted.py`、`backend/tests/tutor/test_gateway.py`。
已知病灶：舊版只在 View 過濾 `key_points`，全階梯 core/tension 仍會洩漏後題；
修復點為 request scope＋producer，既有 cached summary 採用分帳。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、llm-runtime、content-authoring

檔案範圍：
- `backend/app/orchestrator/orchestrator.py`
- `backend/app/orchestrator/policy.py`
- `backend/app/services/conversation.py`
- `backend/app/services/transcripts.py`
- `backend/app/services/history.py`
- `backend/app/repositories/session_repository.py`
- `backend/app/repositories/transcript_repository.py`
- `backend/app/repositories/history_repository.py`
- `backend/app/api/schemas.py`
- `backend/app/api/transcript_schemas.py`
- `backend/app/api/history_schemas.py`
- `backend/app/models.py`
- `backend/app/domain/types.py`
- `backend/app/domain/session_state.py`
- `backend/app/interaction_models.py`
- `backend/app/services/room_view.py`
- `backend/app/api/room_schemas.py`
- `backend/app/modules/solo_dialogue/`
- `backend/app/domain/tutor.py`
- `backend/app/tutor/gateway.py`
- `backend/app/tutor/provider.py`
- `backend/app/tutor/scripted.py`

契約：
- 單人對話（/api/sessions/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

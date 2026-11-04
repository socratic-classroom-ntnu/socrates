# AI Providers（後端）

使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、identity-access

檔案範圍：
- `backend/app/modules/ai_providers/`

契約：
- AI 供應商（/provider-profiles/*、/ai-settings/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 10 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：GET /api/v2/meta/revision、GET /api/v2/provider-profiles、POST /api/v2/provider-profiles、PATCH /api/v2/provider-profiles/{profile_id}、POST /api/v2/provider-profiles/{profile_id}/credential、DELETE /api/v2/provider-profiles/{profile_id}、POST /api/v2/provider-profiles/{profile_id}/test、GET /api/v2/provider-profiles/{profile_id}/models、GET /api/v2/ai-settings/account、PUT /api/v2/ai-settings/account
<!-- module-map:end -->

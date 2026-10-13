# AI Providers（後端）

使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ❌）

- 端：後端；default owner：Portal-Goose
- 可依賴的模組：platform、identity-access

檔案範圍：
- `backend/app/api/routes/provider_profiles.py`
- `backend/app/modules/ai_providers/`

契約：
- AI 供應商（/provider-profiles/*、/ai-settings/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `ai-providers→content-authoring  backend/app/api/routes/provider_profiles.py → backend/app/api/routes/classroom_library.py`
- `ai-providers→group-dialogue  backend/app/api/routes/provider_profiles.py → backend/app/services/ai_students.py`
- `ai-providers→llm-runtime  backend/app/api/routes/provider_profiles.py → backend/app/tutor/classroom_gateway.py`
- `ai-providers→llm-runtime  backend/app/api/routes/provider_profiles.py → backend/app/tutor/classroom_provider.py`
- `route-imports-route  backend/app/api/routes/provider_profiles.py → backend/app/api/routes/classroom_library.py`

## 待清項（源頭修正，做完從這裡刪掉）

- routes/provider_profiles.py 954 行：ORM（ProviderProfile、SessionProviderSecret、AccountAISettings）、金鑰加解密、provider 路由鏈、呼叫稽核全在 route 檔。拆成 repositories（ORM）＋services/providers（加解密、路由鏈、稽核）＋route（只有 HTTP）。
<!-- module-map:end -->

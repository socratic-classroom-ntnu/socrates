# C 包：帳號與 AI

模組：identity-access、ai-providers、llm-runtime（後端，約 3,590 行 Python）

## 起點
- 分支：develop（Arthur 10/20 決定：backend/arthur/dev 的整合內容先進 develop，認領人再從 develop 開自己的分支）。
- 自己的分支命名照 AGENTS.md 的分支表；PR 一個模組一個，送出前先跑下方檢查。
- 先讀：本包每個模組的 `docs/modules/backend/<模組>.md`、`docs/modules/README.md`（總表）、`docs/classroom/STATE-MACHINE.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`。

## 範圍
### Identity & Access（`identity-access`）
- 做什麼：帳號、登入、Email 驗證、重設密碼（/auth/*、寄信 webhook）。
- 可寫的檔案：`backend/app/modules/identity_access/`
- 依賴的其他包：platform（B 包）
- 模組文件：[docs/modules/backend/identity-access.md](../backend/identity-access.md)
- 接手時的待辦：
  - 7 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：POST /api/v2/auth/logout、POST /api/v2/auth/verify、POST /api/v2/auth/verification-email、GET /api/v2/auth/verification-status、POST /api/v2/auth/forgot-password、POST /api/v2/auth/reset-password、POST /api/v2/webhooks/resend
### AI Providers（`ai-providers`）
- 做什麼：使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。
- 可寫的檔案：`backend/app/modules/ai_providers/`
- 依賴的其他包：platform（B 包）
- 模組文件：[docs/modules/backend/ai-providers.md](../backend/ai-providers.md)
- 接手時的待辦：
  - 10 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：GET /api/v2/meta/revision、GET /api/v2/provider-profiles、POST /api/v2/provider-profiles、PATCH /api/v2/provider-profiles/{profile_id}、POST /api/v2/provider-profiles/{profile_id}/credential、DELETE /api/v2/provider-profiles/{profile_id}、POST /api/v2/provider-profiles/{profile_id}/test、GET /api/v2/provider-profiles/{profile_id}/models、GET /api/v2/ai-settings/account、PUT /api/v2/ai-settings/account
### LLM Runtime（`llm-runtime`）
- 做什麼：呼叫模型：prompt 組裝、鐵則、各家 adapter、背景工作佇列。
- 可寫的檔案：`backend/app/modules/llm_runtime/`
- 依賴的其他包：platform（B 包）
- 模組文件：[docs/modules/backend/llm-runtime.md](../backend/llm-runtime.md)
- 接手時的待辦：
  - prompts.compile_program 的 key 算兩次（第一次被覆蓋）。
  - 鐵則：安全類訊息改固定關心句＋老師看得到的安全 flag（與偏題隱藏 flag 分欄）；第 5 條個資措辭已定案。

## 規則（沿用 repo 現行檢查）
- 只 import 其他模組的 contracts／service／repositories；route 不互引、不動態 import（`python scripts/check_modules.py`，違規數只能變少）。
- 回應一律有 response_model；新增端點同時更新 `app/modules/contract/contracts.py` 並重產型別（`python scripts/gen_classroom_types.py`），重產後無 diff。
- 改到別包的檔案：照該檔所屬模組分開送 PR，由那一包的負責人審。

## 送 PR 前的檢查
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

## 交接完成的定義
- 負責人能在本機跑起後端與上面全部檢查。
- 負責人讀完本包模組文件，列出自己要先做的第一件事，並在團隊 Discord 認領。

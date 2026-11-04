# C 包：帳號與 AI

模組：identity-access、ai-providers、llm-runtime（後端）。負責人：Courecta

C 包是這輪新功能的上游：LLM 的 schema、訪客帳號與 embedding 都從這包出來，B 包的呼叫端會等你的契約。建議第一個 PR 先合「型別與函式簽名」，實作再跟上。

## 起點
- 分支：`backend/Courecta`（已經建好，內含你的交接包 `docs/modules/handoff/start/Courecta.md`）。做完一個功能就 PR 到 `backend/main`。
- 一個 PR 只動一個模組，送出前先跑下方的檢查。
- 先讀：[README.md](README.md) 的「第一次拿到這份文件」；本包每個模組的 `docs/modules/backend/<模組>.md`；`docs/classroom/NEW-FEATURES.md`、`docs/classroom/PROMPT-DESIGN.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`。

## 範圍與現有待辦

### Identity & Access（`identity-access`）
- 做什麼：帳號、登入、Email 驗證、重設密碼（`/auth/*`、寄信 webhook）。
- 可寫的檔案：`backend/app/modules/identity_access/`
- 依賴：platform
- 現有待辦：7 個端點還沒有 response_model，清單在 `app/modules/contract/contracts.py` 的 `RESPONSE_MODEL_PENDING`。

### AI Providers（`ai-providers`）
- 做什麼：使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。學生的單人活動用老師的金鑰（`resolve_owner_chain`）。
- 可寫的檔案：`backend/app/modules/ai_providers/`
- 依賴：platform、identity-access
- 現有待辦：10 個端點還沒有 response_model（同上清單）。

### LLM Runtime（`llm-runtime`）
- 做什麼：呼叫模型：prompt 組裝、鐵則、各家 adapter、背景工作佇列。
- 可寫的檔案：`backend/app/modules/llm_runtime/`、`backend/prompts/classroom/`
- 依賴：platform、ai-providers
- 現有待辦：
  - `prompts.compile_program` 的 key 算了兩次，第一次的結果被覆蓋。
  - 安全類訊息的處理已定案：不做固定關心句。離題、惡意離題、危險傾向一律用蘇格拉底式提問拉回，同時標旗標給老師看（見 PROMPT-DESIGN 第 3 節）。

## 新功能工作

| 順序 | 模組 | 功能 | 做什麼 | 完成的樣子 |
|---|---|---|---|---|
| 1 | llm-runtime | prompt 設計 | 在 `contracts.py` 定 7 個新 schema：SoloTutorTurn（含 10 個 flags）、ActivityExpansion、StanceClassification、FinalSummary、RadarAxisNames、RadarDimensions、RadarScores；在 programs.json 新增或改寫對應的 program | B 包可以 import 型別；schema 單元測試通過 |
| 2 | llm-runtime | prompt 設計、多語 | 鐵則 L1 加「回覆語言＝output_locale」；6 份新的 L2；solo_tutor 的 L2 加 flags 定義、拉回規則、不提 flag | 鐵則測試涵蓋每一條 |
| 3 | llm-runtime | 多語、引用 | 語言檢查與引用驗證（message_ref 屬於該學生、quote 是原文子字串）接進 `guarded_generate`，不合格就重試一次 | 不合格的輸出會重試，第二次仍不合格回 typed error |
| 4 | identity-access | 免註冊加入 | migration：帳號加 `kind`、`guest_expires_at`、`recovery_hint_hash`，email／password_hash 可為空；`POST /auth/guest`、`POST /auth/guest/upgrade`；`GET /auth/me` 加 `kind`；訪客加入時選語言 | 驗收見下方 |
| 5 | identity-access | 免註冊加入 | 到期訪客去識別化的排程工作（由本模組提供，app-shell 註冊；platform 不能依賴業務模組） | 第 8 天訪客的暱稱與找回提示被清掉，作答還在 |
| 6 | ai-providers | 雷達 | 本地 embedding provider：`embed(texts) -> list[list[float]]`，預設 multilingual-e5-small、CPU 執行，模型檔隨 backend 映像附上 | 單 pod 實測延遲與記憶體寫進模組文件（參考：1 核 p50 約 279 ms、4 核約 101 ms，約 1.2 GB） |
| 7 | llm-runtime | 評測 | `tests/evals/`：30 則固定題組（每則標好期望的 flags 與 move），可以手動對 OpenAI、Anthropic、Gemini 各跑一次並出報表 | 報表含 schema 合格率、flag 一致率、拉回遵守率、語言正確率、引用有效率；不擋合併 |
| 8 | llm-runtime | 語音 | `POST /speech/tts`：文字→音訊＋字時間點（地圖上原本列為「等契約」） | 前端 media 能播放；老師講話時用 VAD 偵測到學生開口，就停掉 TTS 並接著聽 |

## 和其他包的接縫
- **給 B**：第 1 項的型別、第 4 項的帳號 `kind`、第 6 項的 `embed()`。建議各開一個先合的小 PR，只放契約。
- **給 D**：每個新端點的 response_model，以及新的 reason code（例如 `GUEST_JOIN_DISABLED`、`GUEST_EXPIRED`）。
- **引用關係**：本包不 import B、A 的模組；B 呼叫你，不是你呼叫 B。

## 驗收（測試要涵蓋）
- 訪客從掃碼到開始對話都不需要 email。
- 7 天內註冊的訪客，帳號 id 不變、紀錄都在。
- 第 8 天的訪客已去識別化，作答與統計還在。
- 每個 schema 都有一個合格與一個不合格的測試樣本。
- 學生端的任何回應裡都沒有 flags。

## 規則（沿用 repo 現行檢查）
- 只 import 其他模組的 contracts／service／repositories；route 不互引，也不動態 import。`python scripts/check_modules.py` 的違規數只能變少。
- 回應一律有 response_model。新增端點時同時更新 `app/modules/contract/contracts.py` 並重產型別（`python scripts/gen_classroom_types.py`），重產後不能有 diff。
- 改到別包的檔案時，照該檔所屬的模組分開送 PR，由那一包的負責人審。

## 送 PR 前的檢查
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

## 交接完成的定義
- 能在本機跑起後端與上面全部的檢查。
- 讀完本包的模組文件與 NEW-FEATURES，列出自己的第一個 PR，並在團隊 Discord 認領。

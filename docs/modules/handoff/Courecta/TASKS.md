# Courecta 的工作清單（C 包：帳號與 AI）

## 你的第一個 PR
在 `llm_runtime/contracts.py` 定義 7 個新 schema 的型別：SoloTutorTurn（含 10 個 flags）、ActivityExpansion、StanceClassification、FinalSummary、RadarAxisNames、RadarDimensions、RadarScores。每個 schema 附一個合格、一個不合格的測試樣本。這個 PR 只放型別，不放 prompt；Ken 會等這份型別才開始接，請最先做。

## 全部工作（照順序做；「—」是不綁新功能的現有待辦，有空檔就做）
| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 1 | llm-runtime | prompt 設計 | 上面的第一個 PR，接著在 programs.json 新增或改寫對應的 program | — | Ken 可以 import 型別；schema 單元測試通過 |
| 2 | llm-runtime | prompt 設計、多語 | 鐵則 L1 加「回覆語言＝output_locale」；新增 6 份 L2；solo_tutor 的 L2 加 flags 定義、拉回規則、不提 flag | — | 鐵則測試涵蓋每一條 |
| 3 | llm-runtime | 多語、統整引用 | 語言檢查與引用驗證（message_ref 屬於該學生、quote 是原文子字串）接進 `guarded_generate`，不合格就重試一次；驗證通過後把 `message_ref` 換成 `message_id` 並算出起訖位置，交給 Ken 存放（對外型別由 Amethus 定） | — | 第二次仍不合格回 typed error |
| 4 | identity-access | 免註冊加入 | migration：帳號加 `kind`、`guest_expires_at`、`recovery_hint_hash`，email／password_hash 可為空；`POST /auth/guest`、`POST /auth/guest/upgrade`；`GET /auth/me` 加 `kind`；訪客加入時選語言 | Amethus 審 | 7 天內註冊的訪客，帳號 id 不變、紀錄都在 |
| 5 | identity-access | 免註冊加入 | 提供到期訪客去識別化的排程工作（Ken 在 app-shell 註冊；platform 不能依賴業務模組） | — | 第 8 天訪客的暱稱與找回提示被清掉，作答還在 |
| 6 | ai-providers | 雷達 | 本地 embedding provider：`embed(texts) -> list[list[float]]`，預設 multilingual-e5-small、CPU 執行，模型檔隨 backend 映像附上 | — | 單 pod 實測延遲與記憶體寫進模組文件（參考：1 核 p50 約 279 ms、4 核約 101 ms，約 1.2 GB） |
| 7 | llm-runtime | 評測 | `tests/evals/`：30 則固定題組（每則標好期望的 flags 與 move），可以手動對 OpenAI、Anthropic、Gemini 各跑一次並出報表 | — | 報表含 schema 合格率、flag 一致率、拉回遵守率、語言正確率、引用有效率；不擋合併 |
| 8 | llm-runtime | 語音 | `POST /speech/tts`：文字→音訊＋字時間點 | Amethus 的 TTS 契約 | 前端 media 能播放；老師講話時用 VAD 偵測到學生開口就停掉 TTS |
| — | identity-access | 現有待辦 | 7 個端點補 response_model（清單在 `RESPONSE_MODEL_PENDING`） | Amethus 審 | 重產型別後沒有 diff |
| — | ai-providers | 現有待辦 | 10 個端點補 response_model（同上清單） | Amethus 審 | 重產型別後沒有 diff |
| — | llm-runtime | 現有待辦 | `prompts.compile_program` 的 key 算了兩次，第一次的結果被覆蓋 | — | 只算一次 |

## 注意
- 安全類訊息已定案：不做固定關心句。離題、惡意離題、危險傾向一律用蘇格拉底式提問拉回，同時標旗標給老師看（PROMPT-DESIGN 第 3 節）。
- 學生的單人活動用老師的金鑰（`resolve_owner_chain`）。
- 你這包不 import Ken、Hsy 的模組：他們呼叫你，不是你呼叫他們。

## 規則（repo 現行檢查會擋）
- 只 import 其他模組的 contracts／service／repositories；route 不互相引用，也不動態 import。`python scripts/check_modules.py` 的違規數只能變少。
- 回應一律要有 response_model。新增端點時同一個 PR 更新 `app/modules/contract/contracts.py`，並重產型別（`python scripts/gen_classroom_types.py`），重產後沒有 diff。
- 一個 PR 只動一個模組。改到別包的檔案時，照檔案所屬的模組分開送 PR，給那一包的負責人審。

## 送 PR 前的檢查
在 repo 根目錄依序跑，全部通過再送：
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

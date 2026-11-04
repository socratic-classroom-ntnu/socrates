# 交接包：Courecta（C 包：帳號與 AI）

分支：`backend/Courecta/main`｜PR 目標：`backend/main`｜交接文件：[C-account-ai.md](../C-account-ai.md)

## 第一天
1. 讀 [README.md](../README.md) 的「第一次拿到這份文件」，把專案跑起來，並確認測試全綠。
2. 讀你這包的交接文件：[C-account-ai.md](../C-account-ai.md)。
3. 讀 `docs/classroom/NEW-FEATURES.md`、`docs/classroom/PROMPT-DESIGN.md`。
4. 在團隊 Discord 回報你的第一個 PR 要做什麼。

## 你的第一個 PR
在 `llm_runtime/contracts.py` 定義 7 個新 schema 的型別：SoloTutorTurn（含 10 個 flags）、ActivityExpansion、StanceClassification、FinalSummary、RadarAxisNames、RadarDimensions、RadarScores。每個 schema 附一個合格、一個不合格的測試樣本。

這個 PR 只放型別，不放 prompt。B 包會等這份型別才開始接，所以請最先做這個。

## 你這包的工作（細節見 C-account-ai.md）
1. 7 個新 schema 與 programs.json 的對應 program。
2. 鐵則：L1 加「回覆語言＝output_locale」，新增 6 份 L2，solo_tutor 的 L2 補上規則。
3. 語言檢查與引用驗證接進 `guarded_generate`，不合格就重試一次。
4. identity-access：訪客帳號 migration、`POST /auth/guest`、`POST /auth/guest/upgrade`。
5. 到期訪客去識別化的排程。
6. ai-providers：本地 embedding `embed(texts)`。
7. 30 則固定題組與三家模型評測。
8. `POST /speech/tts`。

## 流程
1. 從 `backend/Courecta/main` 開始，這條分支是從 `backend/main` 開出來的。`backend/Courecta/` 底下可以自由開分支（例如 `backend/Courecta/<主題>`），把 `backend/Courecta/main` 當成根。
2. 做完一個功能，就從 `backend/Courecta/` 底下的分支開 PR 到 `backend/main`。Arthur 審完後合進 backend/main，再以功能為單位打包成 PR 給 `develop`。
3. `backend/main` 有新東西時，先 merge 進自己的分支再繼續做。
4. 送 PR 前跑交接文件裡「送 PR 前的檢查」那幾行。

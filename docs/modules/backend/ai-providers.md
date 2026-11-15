# AI Providers（後端）

使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。

## 本地 embedding（雷達的向量路線）

- `service.embed(texts) -> list[list[float]]`：每段文字一個 `contracts.EMBEDDING_DIMENSIONS`（384）維、長度為 1 的向量，順序與輸入相同；空清單回空清單。餘弦相似度就是內積。
- 模型是 multilingual-e5-small，在 CPU 上跑，不用供應商金鑰；呼叫端傳原文，模型要的 `query: ` 前綴由這裡加。
- 在呼叫的執行緒上跑模型，async 程式請用 `run_in_threadpool` 呼叫。
- 模型檔不在（例如沒有附模型的開發機）時丟 `contracts.EmbeddingUnavailable`。
- 實作：onnxruntime 跑 `intfloat/multilingual-e5-small` 的 fp32 ONNX 匯出（`onnx/model.onnx`、`onnx/tokenizer.json`，MIT）。映像放在 `/opt/models/multilingual-e5-small`，`EMBEDDING_MODEL_DIR` 可以改；每個 worker 第一次呼叫時才載入。`EMBEDDING_THREADS` 設模型用幾個執行緒（預設 0＝看得到的全部核心；容器有 CPU 上限時請設成上限）。
- 實測：在 pod 裡跑 `python tools/embed_bench.py`，結果貼在下表。

| 環境 | 執行緒 | 一份統整 p50 | 30 人一班 p50 | 載入後記憶體 | 載入時間 |
|---|---|---|---|---|---|
| 單 pod | 待測 | | | | |
| 開發機（Apple M5，只供參考） | 1 | 6 ms | 約 120 ms | 1.2–1.6 GB | 0.4–0.6 s |
| 開發機（Apple M5，只供參考） | 4 | 4–5 ms | 約 85 ms | 1.6–1.7 GB | 0.3–0.4 s |

開發機的記憶體讀數每次差很多（macOS 不會馬上把釋放的記憶體還給系統），要以 pod 的數字為準。記憶體大約是模型 1.1 GB、tokenizer 0.4 GB；每個載入模型的 worker 各佔一份。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、identity-access

檔案範圍：
- `backend/app/modules/ai_providers/`

契約：
- AI 供應商（/provider-profiles/*、/ai-settings/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

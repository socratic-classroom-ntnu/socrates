# AI Providers（後端）

使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。

## 回覆不合格式

- 回覆是 JSON 但不合 schema 時丟 `service.ProviderSchemaMismatch`：`reason` 仍是 `PROVIDER_SCHEMA_MISMATCH`、等 30 秒，現有的呼叫端不用改；`fields` 列出每個沒過的欄位 `(路徑, 規則)`，例如 `("summary.reason_summary", "string_too_short")`、`("reply_text", "missing")`，讓 llm-runtime 能附上原因重問。只帶欄位與規則，不帶模型寫的內容（可能引用學生的話）。
- 不是 JSON 的回覆照舊丟一般的 `ProviderWait("PROVIDER_SCHEMA_MISMATCH")`，沒有欄位可指。

## 本地 embedding（雷達的向量路線）

- `service.embed(texts) -> list[list[float]]`：每段文字一個 `contracts.EMBEDDING_DIMENSIONS`（384）維、長度為 1 的向量，順序與輸入相同；空清單回空清單。餘弦相似度就是內積。
- 模型是 multilingual-e5-small，在 CPU 上跑，不用供應商金鑰；呼叫端傳原文，模型要的 `query: ` 前綴由這裡加。
- 在呼叫的執行緒上跑模型，async 程式請用 `run_in_threadpool` 呼叫。
- 模型檔不在（例如沒有附模型的開發機）時丟 `contracts.EmbeddingUnavailable`。
- 實作：onnxruntime 跑 `intfloat/multilingual-e5-small` 的 fp32 ONNX 匯出（`onnx/model.onnx`、`onnx/tokenizer.json`，MIT）。映像放在 `/opt/models/multilingual-e5-small`，`EMBEDDING_MODEL_DIR` 可以改；每個 worker 第一次呼叫時才載入。`EMBEDDING_THREADS` 設每個 worker 的模型用幾個執行緒，預設 1；worker 數 × 執行緒數要等於 pod 的 CPU 上限，超過會被節流、吞吐量少 40–50%。不要設 0：onnxruntime 會照整台節點的核心數開執行緒，不看容器的上限。
- 實測：開發機用 `python tools/embed_bench.py`；pod 的數字是核心組在叢集上用 #145 的映像掃參數量的（每組 60 秒，每個 worker 同時送 30 人一班，沒有被 OOM 砍）。

| 環境 | 執行緒 | 一份統整 p50 | 30 人一班 p50 | 載入後記憶體 | 載入時間 |
|---|---|---|---|---|---|
| 開發機（Apple M5，只供參考） | 1 | 6 ms | 約 120 ms | 1.2–1.6 GB | 0.4–0.6 s |
| 開發機（Apple M5，只供參考） | 4 | 4–5 ms | 約 85 ms | 1.6–1.7 GB | 0.3–0.4 s |

單 pod（stage 與預覽用粗體那一組：4 CPU、`WEB_CONCURRENCY=2`、`EMBEDDING_THREADS=2`，最佳吞吐量的 96%、記憶體一半）：

| CPU | worker × 執行緒 | 每秒幾班 | 每秒幾份統整 | 一班 p95 | 記憶體峰值 |
|---|---|---|---|---|---|
| 4 | 4 × 1 | 2.05 | 57.5 | 2.25 s | 4.1 GB |
| **4** | **2 × 2** | **1.97** | **48.7** | **1.31 s** | **2.0 GB** |
| 4 | 1 × 4 | 1.57 | 34.0 | 0.79 s | 1.2 GB |
| 4 | 4 × 2（超過上限） | 1.19 | 28.5 | 3.62 s | 4.4 GB |
| 2 | 2 × 1 | 1.12 | 30.4 | 2.01 s | 2.1 GB |

每個 worker 載入模型後約 0.9 GB，峰值約 1.2 GB；批次大小 8–64 差不到 5%，維持 32。映像因為附了模型，從 412 MB 變成 899 MB。

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

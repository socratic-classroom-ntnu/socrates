# AI Providers（後端）

使用者的模型供應商：金鑰加密保存、模型矩陣、路由鏈、呼叫稽核。

## 本地 embedding（雷達的向量路線）

- `service.embed(texts) -> list[list[float]]`：每段文字一個 `contracts.EMBEDDING_DIMENSIONS`（384）維、長度為 1 的向量，順序與輸入相同；空清單回空清單。餘弦相似度就是內積。
- 模型是 multilingual-e5-small，在 CPU 上跑，不用供應商金鑰；呼叫端傳原文，模型要的 `query: ` 前綴由這裡加。
- 在呼叫的執行緒上跑模型，async 程式請用 `run_in_threadpool` 呼叫。
- 模型檔不在（例如沒有附模型的開發機）時丟 `contracts.EmbeddingUnavailable`。
- 目前只發布契約；ONNX 實作、映像附模型檔與單 pod 實測數字在後續 PR。

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

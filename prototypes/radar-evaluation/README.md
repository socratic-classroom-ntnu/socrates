# 雷達圖實測評估

用 `students.py` 的 16 位模擬學生，在本機 app 上實際跑老師端的雷達（A），再跑一個「每位學生各自的軸」的雛型（B）。
只新增這個資料夾，不改 `backend/app/`、`frontend/`。

| 檔案 | 做什麼 |
|---|---|
| `students.py` | 16 位模擬學生（需求附件，原樣保留） |
| `seed.py` | 用 API 建老師、課程、活動（名稱 NARRATIVE、第一個情境 S1）和 16 位學生；學生說的話、兩個情境、確認過的摘要直接寫進 attempt |
| `configure_ai.py` | 老師的 AI 設定：OpenRouter，模型 `anthropic/claude-haiku-5.5` |
| `finals.py` | `generate`：用 app 的 `final_summary` 產生每位學生的最終統整，存成 `data/final_summaries.json`；`load N`：把前 N 位從 JSON 灌回去 |
| `probe_embedding.py` | 只跑向量路線的前半段（embedding＋主成分），看能找出幾條軸，不呼叫模型 |
| `run_radar.py` | 用老師帳號讀真的雷達 API，每次結果存在 `runs/<label>/` |
| `run_tendencies.py`、`prompts/tendencies.md` | 雛型 B：直接呼叫模型，替每位學生挑 3–5 個傾向並附原話 |
| `metrics.py`、`tendencies.py` | 報告用的計算（平、重複軸、重跑差異）與雛型 B 的輸出驗證；有測試 |
| `analyze.py` | 從 `runs/` 算出報告的所有數字，存成 `report/numbers.json` |
| `build_pages.py` | 產生 `report/` 的頁面：報告、盲測頁、三種呈現比較頁 |

## 準備（第一次）

1. **embedding 模型**（向量路線要用；沒裝的話 15 人以上會靜默退回模型評分路線）。
   網址與 sha256 和 `deploy/stage/backend.Dockerfile` 前幾行相同：

   ```bash
   cd prototypes/radar-evaluation
   mkdir -p models/multilingual-e5-small && cd models/multilingual-e5-small
   B=https://huggingface.co/intfloat/multilingual-e5-small/resolve/614241f622f53c4eeff9890bdc4f31cfecc418b3/onnx
   curl -fL -o model.onnx $B/model.onnx && curl -fL -o tokenizer.json $B/tokenizer.json
   sha256sum model.onnx tokenizer.json
   # ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665  model.onnx
   # 0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39  tokenizer.json
   ```

2. **OpenRouter 金鑰**：存成 `local/openrouter.key`（一行，只放金鑰）。`local/` 不進 git。

3. **起後端**：在 repo 根目錄，疊上這個資料夾的 `compose.yaml`（把這個資料夾和模型掛進 backend 容器，設好 `EMBEDDING_MODEL_DIR`）。
   要從空的資料庫開始的話，先 `docker compose down -v`（會清掉本機開發資料庫）。

   ```bash
   docker compose -f docker-compose.yml -f prototypes/radar-evaluation/compose.yaml up -d
   ```

以下指令都在 repo 根目錄，透過這個別名在 backend 容器裡跑。`-u` 讓產出的檔案屬於你，而不是容器的 root：

```bash
alias lab='docker compose exec -T -u "$(id -u):$(id -g)" -w /prototypes/radar-evaluation -e PYTHONPATH=/app backend python'
```

## 跑

```bash
lab seed.py                   # 建課程與 16 位學生；ids 記在 local/class.json
lab configure_ai.py           # 老師的 AI 設定

# 最終統整：只產生一次（每人 1 次呼叫，不重試）。失敗的人留在回顧，再跑一次只補那幾位。
# data/final_summaries.json 已經在 repo 裡的話跳過這步，之後所有重跑都從它灌回去。
lab finals.py generate

# A. 現在的雷達（全班共用軸）
lab probe_embedding.py 14 15 16          # 向量能找出幾條軸（不呼叫模型）
lab run_radar.py before 14 --runs 3      # 模型定軸＋模型評分（15 人以下）
lab run_radar.py before 16 --runs 3      # 向量＋主成分（15 人以上）
lab run_radar.py growing 14 15 16 --keep # 依序加到 14、15、16 人時老師看到的

# B. 每人各自的軸
lab run_tendencies.py 1 && lab run_tendencies.py 2 && lab run_tendencies.py 3
```

雷達軸修正合進 `backend/main` 後，同一份 JSON 再跑一次：`lab run_radar.py after 14 --runs 3`。

## 報告

```bash
lab analyze.py       # runs/ → report/numbers.json（不呼叫模型）
lab build_pages.py   # → report/report.html、blind.html、tendencies.html
```

| 檔案 | 內容 |
|---|---|
| `report/report.template.html` | 報告的文字；`{{runs}}`、`{{tendency-table}}`、`{{tendency:姓名}}` 由 `build_pages.py` 換成圖表 |
| `report/quote_judgments.json` | 「原話撐不撐得起分數」的人工標註（14 人第 1 次的 70 格） |
| `report/tendency_judgments.json` | 雛型 B 三次結果一不一樣的人工標註 |
| `report/blind_key.json` | 盲測頁字母對應的學生（請評審看完再打開） |

產生的頁面只有內容，沒有 `<!doctype>`（發布時自動補上），直接用瀏覽器開也看得到。
`report/numbers.json` 與頁面是從 `runs/` 算出來的，換一台電腦跑出的格式相同；模型的回覆每次不同，數字不會完全一樣。

每次讀雷達前，`run_radar.py` 會刪掉 `solo_radars` 裡這個活動那一列（`--keep` 不刪），否則資料沒變就會直接回上次的結果。
看實際走了哪條路，要看每個結果裡的 `sources`（`embedding` 或 `llm`）。

## 測試

```bash
lab -m pytest -q
docker compose exec -T -u "$(id -u):$(id -g)" -w /prototypes/radar-evaluation backend ruff check .
```

主機裝了後端依賴（`pip install -r backend/requirements-dev.txt`）的話，也可以在主機跑：
`cd prototypes/radar-evaluation && PYTHONPATH=../../backend python -m pytest -q`、`ruff check prototypes/radar-evaluation`。

## 注意

- 活動的 `title` 填 NARRATIVE、`scenario` 填 S1。雷達定軸時讀的是活動的 narrative，app 沒有這個欄位，所以退回讀 `title`，也就是 NARRATIVE。
- 模擬學生只有學生自己的話，沒有 AI 家教的回覆；最終統整和雷達讀的本來就只有學生的話。
- 雷達的回應裡沒有模型名稱；用的模型記在每次結果的 `calls[].actual_model`。

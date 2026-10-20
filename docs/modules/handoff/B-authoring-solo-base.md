# B 包：出題、單人與底層

模組：content-authoring、solo-dialogue、platform、app-shell（後端，約 4,078 行 Python）

## 起點
- 分支：develop（Arthur 10/20 決定：backend/arthur/dev 的整合內容先進 develop，認領人再從 develop 開自己的分支）。
- 自己的分支命名照 AGENTS.md 的分支表；PR 一個模組一個，送出前先跑下方檢查。
- 先讀：本包每個模組的 `docs/modules/backend/<模組>.md`、`docs/modules/README.md`（總表）、`docs/classroom/STATE-MACHINE.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`。

## 範圍
### Content Authoring（`content-authoring`）
- 做什麼：劇本與題目（/scripts）、題庫、ladder、AI 協助出題。
- 可寫的檔案：`backend/app/modules/content_authoring/`
- 依賴的其他包：identity-access（C 包）、ai-providers（C 包）、llm-runtime（C 包）
- 模組文件：[docs/modules/backend/content-authoring.md](../backend/content-authoring.md)
- 接手時的待辦：
  - 5 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：POST /api/v2/scripts、PUT /api/v2/scripts/{script_id}、POST /api/v2/scripts/import、GET /api/v2/scripts/{script_id}/yaml、POST /api/v2/scripts/assist
### Solo Dialogue（單人對話）（`solo-dialogue`）
- 做什麼：一對一 ladder 對話與對話室 view（/api/sessions/*；規格擱置：維持可跑、不加功能）。
- 可寫的檔案：`backend/app/modules/solo_dialogue/`
- 依賴的其他包：llm-runtime（C 包）
- 模組文件：[docs/modules/backend/solo-dialogue.md](../backend/solo-dialogue.md)
- 接手時的待辦：
  - 無
### Platform（`platform`）
- 做什麼：資料庫、設定、交易邊界、共用 HTTP 依賴與 model 基底；不依賴任何業務模組。
- 可寫的檔案：`backend/app/modules/platform/`
- 依賴的其他包：無
- 模組文件：[docs/modules/backend/platform.md](../backend/platform.md)
- 接手時的待辦：
  - 相容帳冊（COMPATIBILITY-LEDGER.md）的舊環境變數別名。
### App Shell（`app-shell`）
- 做什麼：組裝層：建 FastAPI app、掛各模組的 router、註冊 ORM 與跨模組 hook、跑背景工作。
- 可寫的檔案：`backend/app/main.py`、`backend/app/classroom_app.py`、`backend/app/classroom_server.py`、`backend/app/modules/app_shell/`
- 依賴的其他包：全部模組（組裝層）
- 模組文件：[docs/modules/backend/app-shell.md](../backend/app-shell.md)
- 接手時的待辦：
  - 1 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：GET /api/v2/readiness

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

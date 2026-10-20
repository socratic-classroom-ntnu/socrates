# A 包：課堂

模組：classroom-core、group-dialogue、analytics（後端，約 4,922 行 Python）

## 起點
- 分支：develop（Arthur 10/20 決定：backend/arthur/dev 的整合內容先進 develop，認領人再從 develop 開自己的分支）。
- 自己的分支命名照 AGENTS.md 的分支表；PR 一個模組一個，送出前先跑下方檢查。
- 先讀：本包每個模組的 `docs/modules/backend/<模組>.md`、`docs/modules/README.md`（總表）、`docs/classroom/STATE-MACHINE.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`。

## 範圍
### Classroom Core（`classroom-core`）
- 做什麼：課程（教室庫與課堂 AI 設定）、課堂狀態機、作答、討論、即時事件匯流排、available_actions（/classrooms/*、/library/*）。
- 可寫的檔案：`backend/app/modules/classroom_core/`
- 依賴的其他包：platform（B 包）、identity-access（C 包）、ai-providers（C 包）、llm-runtime（C 包）、content-authoring（B 包）
- 模組文件：[docs/modules/backend/classroom-core.md](../backend/classroom-core.md)
- 接手時的待辦：
  - 補 HTTP 層測試（TestClient 打真路由、讀回 200 與欄位）：POST /api/v2/classrooms/{room_id}/reactions、POST /api/v2/classrooms/{room_id}/budget、GET /api/v2/classrooms/{room_id}/events、POST /api/v2/scripts/{script_id}/adopt-question/{room_id}/{index}
### Group Dialogue（`group-dialogue`）
- 做什麼：分組課：分組、個人追問、全組確認、AI 學生、分組立場分佈（教師用）。
- 可寫的檔案：`backend/app/modules/group_dialogue/`
- 依賴的其他包：platform（B 包）、identity-access（C 包）、ai-providers（C 包）、llm-runtime（C 包）、content-authoring（B 包）
- 模組文件：[docs/modules/backend/group-dialogue.md](../backend/group-dialogue.md)
- 接手時的待辦：
  - 補 HTTP 層測試（TestClient 打真路由、讀回 200 與欄位）：GET /api/v2/groups/runs/{rid}/members/{mid}/identity、POST /api/v2/groups/classrooms/{rid}/ai-students、POST /api/v2/groups/classrooms/{rid}/ai-students/clear、POST /api/v2/suggestions/other
### Analytics（`analytics`）
- 做什麼：教師分析：分組課的證據投影（/groups/classrooms/{id}/analysis）。
- 可寫的檔案：`backend/app/modules/analytics/`
- 依賴的其他包：platform（B 包）
- 模組文件：[docs/modules/backend/analytics.md](../backend/analytics.md)
- 接手時的待辦：
  - 1 個端點還沒有 response_model（前端只能手寫型別），清單在 app/modules/contract/contracts.py 的 RESPONSE_MODEL_PENDING：GET /api/v2/groups/classrooms/{rid}/analysis
  - 雷達圖契約（依設計稿的教師分析六畫面）。

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

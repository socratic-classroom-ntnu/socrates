# A 包：課堂

模組：classroom-core、group-dialogue、analytics（後端）。負責人：Hsy

A 包是全班課堂與分組課。這一輪的六項新功能主要落在單人活動（B、C 包）。A 包先把現有待辦清完，等單人活動的旗標上線後，再把同一套旗標接到分組課。

## 起點
- 分支：`backend/Hsy/main`（已經建好）。為你訂製的交接包在 `docs/modules/handoff/Hsy/`：README 與 TASKS。做完一個功能就 PR 到 `backend/main`。
- 一個 PR 只動一個模組，送出前先跑下方的檢查。
- 先讀：[README.md](README.md) 的「第一次拿到這份文件」；本包每個模組的 `docs/modules/backend/<模組>.md`；`docs/classroom/STATE-MACHINE.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`、`docs/classroom/NEW-FEATURES.md`。

## 範圍與現有待辦

### Classroom Core（`classroom-core`）
- 做什麼：課程（教室庫與課堂 AI 設定）、課堂狀態機、作答、討論、即時事件匯流排、available_actions（`/classrooms/*`、`/library/*`）。
- 可寫的檔案：`backend/app/modules/classroom_core/`
- 依賴：platform、identity-access、ai-providers、llm-runtime、content-authoring
- 現有待辦：補 HTTP 層測試（TestClient 打真的路由，讀回 200 與欄位），涵蓋以下端點：
  - `POST /api/v2/classrooms/{room_id}/reactions`
  - `POST /api/v2/classrooms/{room_id}/budget`
  - `GET /api/v2/classrooms/{room_id}/events`
  - `POST /api/v2/scripts/{script_id}/adopt-question/{room_id}/{index}`
- 注意：舊的單人對話（solo-dialogue）已經刪除，classroom-core 對它的依賴也一起拿掉了。接手時先跑一次 `python scripts/check_modules.py`，確認違規數是 0。

### Group Dialogue（`group-dialogue`）
- 做什麼：分組課的分組、個人追問、全組確認、AI 學生，以及給教師看的分組立場分佈。
- 可寫的檔案：`backend/app/modules/group_dialogue/`
- 依賴：platform、identity-access、ai-providers、llm-runtime、content-authoring、classroom-core
- 現有待辦：
  - 補 HTTP 層測試，涵蓋以下端點：
    - `GET /api/v2/groups/runs/{rid}/members/{mid}/identity`
    - `POST /api/v2/groups/classrooms/{rid}/ai-students`
    - `POST /api/v2/groups/classrooms/{rid}/ai-students/clear`
    - `POST /api/v2/suggestions/other`

### Analytics（`analytics`）
- 做什麼：教師分析，即分組課的證據投影（`/groups/classrooms/{id}/analysis`）。
- 可寫的檔案：`backend/app/modules/analytics/`
- 依賴：platform、classroom-core、group-dialogue
- 現有待辦：`GET /api/v2/groups/classrooms/{rid}/analysis` 還沒有 response_model，清單在 `app/modules/contract/contracts.py` 的 `RESPONSE_MODEL_PENDING`。

## 新功能工作（第二版，排在單人活動的旗標上線之後）

| 模組 | 功能 | 做什麼 | 依賴的契約 |
|---|---|---|---|
| group-dialogue | 旗標與學生指標 | 個人追問（personal_tutor）套用同一組 10 個旗標，每則訊息都存 flags | C 包的 PersonalTutorTurn 加上 flags |
| analytics | 旗標與學生指標 | 分組課的教師分析帶出同一組指標與標記 | B 包 solo-activity 的指標純函式（直接重用，不另外寫一份） |
| analytics | 雷達圖 | 分組課沿用單人活動的雷達契約 | B 包的雷達契約 |

第一版沒有 A 包的新功能工作，所以接手後先清上面的現有待辦。

## 規則（沿用 repo 現行檢查）
- 只 import 其他模組的 contracts／service／repositories；route 不互相引用，也不動態 import。`python scripts/check_modules.py` 的違規數只能變少。
- 回應一律要有 response_model。新增端點時同時更新 `app/modules/contract/contracts.py` 並重產型別（`python scripts/gen_classroom_types.py`），重產後不能有 diff。
- 改到別包的檔案時，照該檔所屬的模組分開送 PR，由那一包的負責人審。

## 送 PR 前的檢查
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

## 交接完成的定義
- 能在本機跑起後端，並通過上面全部的檢查。
- 讀完本包的模組文件，列出自己的第一個 PR，並在團隊 Discord 認領。

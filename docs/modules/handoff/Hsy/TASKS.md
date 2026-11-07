# Hsy 的工作清單（A 包：課堂）

## 你的第一個 PR
classroom-core 的 HTTP 層測試：用 TestClient 打真的路由，讀回 200 與欄位。涵蓋：
- `POST /api/v2/classrooms/{room_id}/reactions`
- `POST /api/v2/classrooms/{room_id}/budget`
- `GET /api/v2/classrooms/{room_id}/events`
- `POST /api/v2/scripts/{script_id}/adopt-question/{room_id}/{index}`

## 全部工作（照順序做；「—」是不綁新功能的現有待辦，有空檔就做）
| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 1 | classroom-core | 現有待辦 | 上面的 HTTP 層測試（4 個端點） | — | 4 個端點都有打真路由的測試 |
| 2 | group-dialogue | 現有待辦 | HTTP 層測試：`GET /groups/runs/{rid}/members/{mid}/identity`、`POST /groups/classrooms/{rid}/ai-students`、`POST /groups/classrooms/{rid}/ai-students/clear`、`POST /suggestions/other` | — | 4 個端點都有打真路由的測試 |
| 3 | analytics | 現有待辦 | `GET /groups/classrooms/{rid}/analysis` 補 response_model，並從 `RESPONSE_MODEL_PENDING` 拿掉 | Amethus 審 | 重產型別後沒有 diff |
| 4 | group-dialogue | 旗標與學生指標（第二版） | 個人追問（personal_tutor）套用同一組 10 個旗標，每則訊息存 flags | Courecta 的 PersonalTutorTurn flags | 每則個人追問都存 10 個旗標；學生端回應裡沒有 flags |
| 5 | analytics | 旗標與學生指標（第二版） | 分組課的教師分析帶出同一組指標與標記 | Ken 的指標純函式 | 指標只在那一個純函式裡算 |
| 6 | analytics | 雷達圖（第二版） | 分組課沿用單人活動的雷達契約 | Amethus 的雷達契約 | 前端用同一份契約畫分組課雷達 |
| 7 | classroom-core | 免註冊加入 | 實作訪客紀錄 hook：分組課成員與作答紀錄的 `reassign`、`delete`；同一間教室兩邊都有時以帳號那份為準 | Courecta 5 的契約 | 併入與刪除之後分組課測試全綠 |

## 注意
- 舊的單人對話（solo-dialogue）已經刪除，classroom-core 對它的依賴也一起拿掉了。接手時先跑一次 `python scripts/check_modules.py`，確認違規數是 0。

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

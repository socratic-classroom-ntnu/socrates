# 蘇格拉底式對話機器人 — 專案規則

這是一個哲學課堂的對話系統。它不是要問倒學生，是要讓學生**照見自己原有的立場**。
**教學效果優先於實作便利**：本檔列出的條款違反了就是缺陷，不是風格問題。

## 動手前必讀

- `docs/superpowers/specs/2026-09-19-socratic-tutor-design.md` §4（教學設計決策）
- 同檔 §5.1（Orchestrator／TutorGateway 的分界線）

## 不可妥協條款

| 條款 | 為什麼 |
|---|---|
| 未進入的階段不回傳 `title` | 學生若知道下一題是什麼，答第一題時就會自我保護，鏡子照不到真實直覺 |
| 情境開場白逐字輸出、不經 LLM | 經典難題的效力在於敘述的精確，換句話說會稀釋掉它 |
| 學生訊息先落地才呼叫 provider | 學生想很久寫的一段話因模型超時而消失，是最不能發生的事 |
| 推進判準（地板 + 三條件 + 未改變立場）**全部**住在 `StageAdvancePolicy` | 讓模型自己說「達成了」等於把規則藏進模型，換家模型就變；規則散到 Orchestrator，讀 policy.py 的人就會以為看到了全部 |
| 上限到了未達成標 `capped` 不標 `goal_met` | 照見包含照見自己的模糊 |
| `available_actions` 由後端決定 | 前端一旦自己推導，狀態機就被實作兩次，然後兩邊走鐘 |
| `ended` 之後任何動作一律拒絕 | — |
| 壞掉的 ladder yaml 要讓服務啟動失敗 | 不能等學生跑到第三階才爆 |
| Orchestrator 不得 import 任何 provider | 這條線是腳本驗收與真 API 共用流程的原因 |

## 範本索引

| 要做什麼 | 照這個檔案寫 |
|---|---|
| 新增 API 端點 | `backend/app/api/routes/messages.py` |
| 新增讀取查詢 | `backend/app/api/routes/sessions.py` 的 `get_session` |
| 改狀態機 | `backend/app/orchestrator/orchestrator.py`，先改 `backend/tests/invariants/test_state_machine_table.py` |
| 新增前端按鈕 | `frontend/src/components/ActionBar.tsx`——**不要在頁面裡自己判斷** |
| 新增前端畫面 | `frontend/src/pages/Conversation.tsx` |
| 呼叫 API | `frontend/src/api/client.ts`，型別一律從 `types.ts` 取，不要手寫 |

## API 慣例：兩條並列的規則

1. 資源的 CRUD 用 REST
2. **狀態機轉換用 `POST /{resource}/{id}/{action}`**，且 action 名稱必須出現在 `Action` Literal union 裡

`/advance`、`/end`、`/retry` 屬規則 2，**不要把它們重構成 `PATCH`**——
它們與後端回傳的 `available_actions` 是 1:1 對應，改掉前後端契約當場斷掉。

## 明文禁止

- 修改 `backend/tests/invariants/` 與 `frontend/src/invariants/` 讓程式碼通過。要改先開 issue
- 在前端由 `flow_state` 推導按鈕
- 讓 LLM 改寫情境開場白
- `git commit --no-verify`
- 未經使用者明確要求，由 AI 執行 `git add`／`git commit`／`git push`／`git fetch`／`git pull`
- 手寫 `frontend/src/api/types.ts`（它是產生物，跑 `./scripts/gen_types.sh`）

## 分支流程

| 分支 | 規則 |
|---|---|
| **`main`** | 穩定分支。**只能透過 PR 進入**，CI 三個檢查必須綠燈 |
| **`develop`** | 整合分支。**可以直接推**，但 CI 一樣會跑 |
| `feature/*` | 較大的改動從 `develop` 開，PR 回 `develop` |

**推 `develop` 之前請在本機把檢查跑過**（見下方指令）。直接推代表沒有 PR 擋著，
紅燈會直接留在共用分支上——後面的人接著推就會踩到別人的紅燈，而且分不清是誰弄的。

**develop 紅燈時第一優先是修好它**，不是繼續往上疊。

`develop → main` 由核心組在功能告一段落時開 PR 合併。

## 指令與 git 慣例

```bash
docker compose up -d                                  # 起全棧（db / backend / frontend）

docker compose exec backend python -m pytest tests -q # 後端測試
docker compose exec backend ruff check .              # 後端 lint
docker compose exec backend ruff format --check .     # 後端格式
docker compose exec backend mypy app                  # 後端型別

cd frontend && npm test -- --run                      # 前端測試
cd frontend && npm run lint && npm run typecheck

./scripts/gen_types.sh                                # 後端 schema 改了就跑這個
```

後端指令走容器是因為主機通常沒裝 Python 依賴。要在主機跑就先
`pip install -r backend/requirements-dev.txt`。

**後端測試會自己連到 `socrates_test`，不會動到開發資料庫。** 不要為了跑測試而手動
設 `DATABASE_URL` 指向 `socrates`——`conftest.py` 有守衛會直接拒絕啟動。

PR 送出前請把上面那一整組跑過一次，CI 跑的是同一組。

Commit 訊息用 conventional commits：`type(scope): description`。
因為 repo 只開放 squash merge，**這條規範實際落在 PR 標題上**。
描述寫「為什麼」，不要複述 diff。

PR 描述固定三行：**改了什麼／碰到哪些共用點（資料模型？`SessionView`？狀態機？）／怎麼驗證的**。

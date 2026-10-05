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
| 推進判準（地板 + 三條件 + 未改變立場）**全部**住在 `backend/app/orchestrator/policy.py`（`should_advance`／`stage_goal_met`，測試 `backend/tests/invariants/test_stage_advance_policy.py`） | 讓模型自己說「達成了」等於把規則藏進模型，換家模型就變；規則散到 Orchestrator，讀 policy.py 的人就會以為看到了全部 |
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
| 新增 migration | 改 ORM 後跑 `alembic revision --autogenerate`，範本是 `backend/migrations/versions/0010_classroom.py`；`tests/migrations/test_schema_matches_orm.py` 會擋 ORM 與 migration 不一致 |

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
- 手寫 `frontend/src/api/types.ts`、`frontend/openapi.json`（產生物，跑 `./scripts/gen_types.sh`）或 `frontend/src/api/classroomTypes.ts`、`frontend/classroom-openapi.json`（產生物，跑 `python scripts/gen_classroom_types.py`）
- 在 `frontend/src/` 新增 `.js`／`.jsx`／`.cjs`。前端以 TypeScript 為準（`frontend/STACK-CONTRACT.json`），`src/stack.test.ts` 會擋；`.mjs`（avatar runtime 與 `features/group-analytics/graphLayout.mjs`）目前不擋
- 在 migration 裡 import `app.*`（`tests/migrations/test_migration_hygiene.py` 會擋）；不 import `app` 就拿不到 ORM 的 model，`create_all()` 也就只能建 migration 自己宣告的表
- 為 migration 寫共用的 helper 函式
- 在資料庫物件名稱裡加開發回合編號（`r2_`、`r104_`……）；名稱說明它裝什麼（`tests/migrations/test_no_round_prefix.py` 會擋）

## 分支流程

| 分支 | 規則 |
|---|---|
| **`main`** | 穩定分支。**只能透過 PR 進入**，CI 三個檢查必須綠燈 |
| **`develop`** | 整合分支。**可以直接推**，但 CI 一樣會跑 |
| `feature/*` | 較大的改動從 `develop` 開，PR 回 `develop` |
| **`develop`／`master`** 的 image | push 後 CI 綠燈會推 `develop-*`／`master-*` tag 的 image 到 ghcr，**不會部署**（Flux 只追 `stage-*`）。不要把這兩個前綴改成 `stage-` |
| **`stage`** | **push 就是部署**：CI 的 `release / build` 推出 `stage-*` image 後，k8s 上的 Flux 會自動換上。需要配合資料庫一起動的版本，push 前先跟主機擁有者協調（`deploy/stage/README.md`〈目前的部署方式〉） |

**推 `develop` 之前請在本機把檢查跑過**（見下方指令）。直接推代表沒有 PR 擋著，
紅燈會直接留在共用分支上——後面的人接著推就會踩到別人的紅燈，而且分不清是誰弄的。

**develop 紅燈時第一優先是修好它**，不是繼續往上疊。

`develop → main` 由核心組在功能告一段落時開 PR 合併。

## 指令與 git 慣例

```bash
docker compose up -d                                  # 起全棧（db / backend / frontend）

docker compose exec backend python -m pytest tests -q # 後端測試
docker compose exec backend ruff check .          # 後端 lint
docker compose exec backend ruff format --check . # 後端格式
# 型別：兩條 mypy（Round 1 strict、教室模組走 mypy-classroom.ini），完整參數見 .husky/pre-push（與 CI 逐字相同）

cd frontend && npm test -- --runInBand                # 前端測試
cd frontend && npm run lint && npm run typecheck && npm run build

./scripts/gen_types.sh                                # Round 1 schema 改了就跑這個
python scripts/gen_classroom_types.py                 # 教室（/api/v2）schema 改了就跑這個
```

後端指令走容器是因為主機通常沒裝 Python 依賴。要在主機跑就先
`pip install -r backend/requirements-dev.txt`。

**兩支型別產生器都要在主機跑**：容器沒有掛 `frontend/`，產物寫不出來。主機需要後端依賴——
建 `backend/.venv` 並 `backend/.venv/bin/pip install -r backend/requirements.txt`（`gen_types.sh`
會自動用 `backend/.venv`，也可以用 `PYTHON_BIN` 指定；`gen_classroom_types.py` 請用
`backend/.venv/bin/python scripts/gen_classroom_types.py` 執行），前端也要先 `npm ci`。
CI 的必要檢查 `contract` 會重跑這兩支並比對產物，沒有重新產生就會紅燈。

**後端測試會自己連到 `socrates_test`，不會動到開發資料庫。** `conftest.py` 會把任何
`DATABASE_URL` 自動改寫成 `<原名>_test`，不需要、也不要為了跑測試手動改 `DATABASE_URL`。

**上面這組檢查已經用 husky 掛成 git hook，commit／push 前會自動跑**（`.husky/pre-commit`、`.husky/pre-push`）：
- `pre-commit` 只檢查有變更的部分（改了 `frontend/` 就跑 lint+typecheck，改了 `backend/` 就跑 ruff），不含測試，速度快。
- `pre-push` 固定跑滿上面這組，對齊 CI 的 `backend`／`frontend` 兩個 job——**包含 `npm run build`**，
  因為那是唯一會抓到「production build 壞掉、image 建不起來」的檢查。

**`pre-push` 的 `alembic upgrade head` 跑在一個拋棄式資料庫上**（建 `socrates_migration_check`、跑完整條鏈、刪掉），
因為開發資料庫已經在 head，`upgrade` 是 no-op，擋不住「migration 鏈本身壞掉」。CI 的資料庫是全新的，
這樣才對得上。整段約 1 秒。2026-10-03 就是從這個缺口漏出去的：Task 30 改了 model 的註冊時機，
pytest（fixture 一律 `create=True`）全綠，而全新資料庫的 `alembic upgrade head` 當場 `NoReferencedTableError`。

**migration 必須是自給自足的 DDL，而且與 ORM 一致。** import 應用程式的 model 會讓 migration 的產出
變成「當前 ORM 定義」的函式——同一支 migration 今天跑和重構之後跑會建出不同的東西，而既有資料庫
不會重跑，於是新舊資料庫悄悄分歧。2026-10-03 的 CI 紅燈就是這樣來的：有人把一行 import 從模組層級
移進函式內（那個搬動本身是對的），`0006` 的產出就變了。反過來，手寫的 migration 也會跟 ORM 分歧：
`0104` 與 ORM 差了 15 處，直到 2026-10-05 才被量到。所以 migration 一律用 autogenerate 從 ORM 產生、
產生後不再 import `app`，並由 `test_schema_matches_orm.py` 對全新資料庫比對。
2026-10-05 起 stage 專屬的 `0006`–`0104` 已合併成 `0010`；本機資料庫若還停在舊 revision，
`alembic upgrade` 會報 `Can't locate revision`，刪掉重建即可。

**hook 仍未涵蓋 CI 的其他部分**：必要檢查 `contract`（重跑兩支型別產生器並比對產物）、
`round1-e2e`（`docker compose up --build` 加 `scripts/round1_smoke.py`）、`classroom-load`，
以及 `frontend` job 前的 `scripts/fetch_avatar.py`。改了 schema 就自己跑型別產生器，其餘看 CI 結果。

**hook 的指令必須與 `.github/workflows/ci.yml` 的 `backend`／`frontend` job 逐條對應。** 型別檢查是兩條而不是一條：
Round 1 走 `strict`，教室模組走較寬的 `backend/mypy-classroom.ini`（兩者都逐檔列出教室模組，新增教室模組時兩邊都要加）。lint 的範圍是 `backend`，
不含 `scripts/`；`backend/pyproject.toml` 已用 `extend-exclude` 排除，因為 root compose 把 `./scripts`
掛進了 `/app/scripts`。**CI 改了就要同時改 hook**，反之亦然——2026-09 曾經因為 CI 隨
教室模組／Jest 遷移更新、hook 沒跟上，導致 hook 拿 Vitest 時代的 `--run` 餵給 Jest
而無條件失敗，並且用 strict mypy 掃教室模組而多報數百個 CI 不在意的錯。

**第一次 clone／pull 到這個設定後，要在 repo 根目錄跑一次 `npm install`**，`core.hooksPath` 才會在本機生效——這是本機 git config，不會隨 commit 自動套用到別人機器上。
**push 前、以及 commit 有改到 `backend/` 時，backend 容器都要是開著的**（先跑 `docker compose up -d`）：hook 用 `docker compose exec` 跑後端檢查，容器沒開會直接擋下並提示。

PR 送出前請把上面那一整組跑過一次；CI 除了這組，還會跑上面列的 `contract`、`round1-e2e`、`classroom-load`。

Commit 訊息用 conventional commits：`type(scope): description`。
因為 repo 只開放 squash merge，**這條規範實際落在 PR 標題上**。
描述寫「為什麼」，不要複述 diff。

PR 描述固定三行：**改了什麼／碰到哪些共用點（資料模型？`SessionView`？狀態機？）／怎麼驗證的**。

### 查搬移前的歷史

`backend/app/run2/` 與 `frontend/src/run2/` 已於 2026-10-05 解散、併入各分層（新位置見 `docs/CLASSROOM-ARCHITECTURE.md`）。
`git log <path>` 預設**不會**顯示搬移前的歷史，請用 `git log --follow <path>`。
`git blame` 不受影響，會正確顯示原作者。

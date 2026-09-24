# Socrates Run2 — Stage 伺服器部署

## 交付目的

`stage` 是伺服器組員採用的來源。應用服務固定為 **frontend＋backend 兩個容器**。
PostgreSQL、SMTP 郵件服務及既有 Cloudflare Tunnel 由伺服器環境提供。

公開入口：`https://socratic.arthur0824hao.com`。

## 1. 準備一次性的環境資料

| 設定 | 提供方式 | 作用 |
|---|---|---|
| Docker Engine＋Compose v2 | 伺服器管理員 | 建置與啟動兩個容器 |
| PostgreSQL 專用資料庫 | `DATABASE_URL` | 持久化所有帳號、作答、課堂事件、積分 |
| SMTP | HOST／PORT／FROM／USER／PASSWORD | Email 驗證、忘記密碼；註冊後由郵件連結啟用 |
| OpenRouter 平台 key | `OPENROUTER_API_KEY` | `openrouter/free` live Tutor、動態題與總結 |
| 現有 Tunnel 路由權限 | 管理員的 Cloudflare 帳號 | 將公開網域接到本機8080 |
| 建置主機對外 HTTPS | 能連到 `raw.githubusercontent.com`（備援 `api.github.com`） | 前端 image 在 build 期下載釘選版 avatar（CC-BY-NC-4.0，非商業教學用） |

應用僅對 host `127.0.0.1:8080`提供入口，資料庫由 backend 內部連接。
`DATABASE_URL` 的 hostname 應能從 backend 容器解析；host PostgreSQL 可用
`host.docker.internal`，Compose 已配置 Linux host-gateway。
SMTP 與模型 key 留在伺服器 `.env`／credential store，GitHub source 只收 `.env.example`。

`frontend/public/avatars/ce-brunette/avatar.glb`（4.7 MB）不在 repo 內，前端 image 會在 build 期
依 `SOURCE.json` 的釘選 URL 下載並驗證 blob SHA。**建置主機沒有對外連線就無法建置**；
離線主機請先自行把 `avatar.glb` 放進 `frontend/public/avatars/ce-brunette/` 再跑 `up.sh`，
preflight 偵測到檔案已存在就會跳過連線檢查。

## 2. 首次部署

```bash
git clone --branch stage https://github.com/socratic-classroom-ntnu/socrates.git
cd socrates
cp deploy/stage/.env.example deploy/stage/.env
chmod 600 deploy/stage/.env
# 用伺服器的安全編輯器填入 DATABASE_URL、SMTP 與 OPENROUTER_API_KEY。
bash deploy/stage/preflight.sh
bash deploy/stage/up.sh
```

Backend 啟動時執行 Alembic 升版，再啟動2個 Uvicorn workers；frontend 使用 Nginx，
`/api/*` 及 WebSocket upgrade 轉交 `backend:8000`。資料庫連線池每worker最多10條，
另有每worker一條專用 LISTEN 連線；請依同機其他服務預留資料庫 connection budget。

預期：`/api/v2/readiness` 回傳 `status=ready,database=connected`，兩個服務為 running。

```bash
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml ps
curl -fsS http://127.0.0.1:8080/api/v2/readiness
curl -fsS http://127.0.0.1:8080/api/release
```

`preflight.sh` 在建置前就擋下不完整的 checkout／環境：缺 `docker`／`git`／`curl`／`python3`、
Docker daemon 沒起來、`deploy/stage/.env` 不存在或 `DATABASE_URL` 還是 `REPLACE_ME`、
缺 `frontend/package-lock.json`、`scripts/gen_types.sh` 沒有執行位元、或 avatar 來源連不到，
都會在這一步失敗而不是 build 到一半才爆。

部署驗收要求下面兩條都通過：

```bash
bash deploy/stage/smoke.sh
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml exec backend python -m alembic current
```

`smoke.sh` 會依序驗前端首頁、`/api/health`、`/api/v2/readiness`、`/api/release`，
再跑 `scripts/round1_smoke.py` 走一次 Round 1 的持久化流程。
預期的 migration 輸出是 `0006 (head)`。

## 3. 接入既有 Tunnel

由 Tunnel owner 將下列hostname route加入現有 ingress，再使用自己的服務管理程序重載：

```yaml
- hostname: socratic.arthur0824hao.com
  service: http://127.0.0.1:8080
```

Cloudflare DNS／Tunnel 綁定由該環境的 owner 執行，保留其他既有 hostname 路由。
本配置的 cloudflared 在host執行；containerized cloudflared可使用能抵達frontend的同網路service位址。

```bash
curl -fsS https://socratic.arthur0824hao.com/api/v2/readiness
curl -fsS https://socratic.arthur0824hao.com/api/release
```

## 4. 最小公開 smoke

教師註冊→郵件驗證→登入→教師模式→建立／儲存劇本→建立教室→分享課程碼。
學生註冊／驗證→加入教室→填匿名名。教師開始後依序3-2-1、作答、5秒分布、代表追問、總結。
教師也能切學生模式加入自己的教室，以一個帳號完成單人試玩。
同一教室內教師權限由 creator 判定；Cookie＋伺服器 membership 決定實際權限。

每一題可設秒數（預設90）、選項、argument_required、追問上限（預設3）、反應積分上限。
`dynamic` 模式使用初始題，後續題由LLM生成並提供預設8秒教師preview，時間到自動採用。
額度等候時，動態題與總結顯示「稍後再產生」，課堂資料保持已保存狀態。
Focused Tutor可用劇本 `probe_hints` 作為可重现fallback，介面會標示來源。

## 5. CI／Release／CD 採用順序

本次 Loom：source commit `[skip ci]`先發布→回讀遠端→**相同Git tree**的CI啟動commit→CI。
後續一般stage push直接走CI。CI的backend、frontend、contract、Round1、Run2負載皆成功後，
呼叫同一revision的Stage Release。Release.json以image digest固定來源與相依lock。
Stage Deploy消費這兩個digest。

自動CD入口由repo owner設定 `SOCRATES_STAGE_RUNNER_ADMITTED=true`，
並先註冊專用 `[self-hosted, linux, socrates-stage]` runner以及stage environment secrets：
`SOCRATES_DATABASE_URL`, `OPENROUTER_API_KEY`, `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`。
尚在人工部署模式時，直接使用本README。首次驗收在host smoke完成後記錄actual source與images。

兩個應用容器保持2個；郵件與DB為外部服務。
本次工具鏈遷移的lock由Loom嘗試建立；CI會保存實际建置lock，Release使用同一份lock。
Source publication、CI結果、image publication、public adoption各有獨立receipt。

## 6. 更新與資料保留

```bash
bash deploy/stage/update.sh
```

資料庫升版前由DB owner依既有備份程序保存資料庫快照。
应用回版使用已記錄、與當前schema相容的前一組image digests；所有r2資料保留於PostgreSQL。
將 `BACKEND_IMAGE`／`FRONTEND_IMAGE` 填為已驗證digest後執行 `pull` 與 `up -d --no-build`。
Schema演進使用明確資料遷移，R2 migration downgrade會交由資料owner處理。

## 7. 運維與狀態回覆

```bash
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml logs --tail 100 backend frontend
```

| 現象 | 最小操作 |
|---|---|
| 等待Email | 確認SMTP連線、寄件網域設定與收件匣；mail outbox持續重送 |
| 動態題／summary等待 | 補齊OpenRouter key、供應商額度與班級budget；pending job自動續接 |
| 班級budget用完 | creator可POST `/api/v2/classrooms/{id}/budget?live_llm_call_budget=60`，附session與CSRF；這是本班總call上限 |
| WebSocket反覆重連 | 核對Tunnel、Nginx Upgrade headers、public origin與Cookie HTTPS設定 |
| DB readiness | 由backend容器檢視DB hostname、帳密、Alembic及網路路由 |

回給Arthur：stage commit、CI run URL、兩容器image IDs、public readiness與release回應、
一位教師＋一位學生完整題目smoke結果。Credentials保留於credential store。

2×60容量驗收在專用CI資料庫與兩worker上進行。20ms controlled、100–150ms public是測量目標；
請讀實際receipt中的延遲資料與適用網路範圍。此README本身提供部署程序。

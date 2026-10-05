# Socrates 教室 — Stage 伺服器部署

## 交付目的

`stage` 是伺服器組員採用的來源。應用服務固定為 **frontend＋backend 兩個容器**。
PostgreSQL、郵件服務（預設 Resend API）及既有 Cloudflare Tunnel 由伺服器環境提供。

公開入口：`https://socrates.driseam.com`（目前 302 轉到 `https://socrates-qa.driseam.com`）。

## 目前的部署方式（先讀這段）

stage 跑在 **Kubernetes 上，由 Flux 的 image automation 部署**：

1. push 到 `stage` → CI 全綠 → `release / build` job 把 image 推到 ghcr，tag 是
   `sha-<sha>` 與 `stage-<UTC 時間>-<sha>`（`.github/workflows/stage-release.yml`）。
2. Flux 每小時掃一次 ghcr，看到較新的 `stage-*` tag 就自動換上。所以 push 之後**最多約一小時**才會上線，
   但時間點不固定，不能拿這段時間差來安排資料庫操作。

`develop` 與 `master` push 後 CI 綠燈也會推 image，tag 是 `develop-<UTC 時間>-<sha>`／`master-<UTC 時間>-<sha>`（`ci.yml` 的 `release-snapshot`）。
Flux 只追 `stage-*`，所以這兩個**不會被部署**；Flux 的 tag 篩選不可放寬到包含它們。

所以 **push 到 `stage` 就是部署**。GitHub 上沒有「deploy」這一步可以看；`release / build`
成功就代表這個 SHA 會被部署。確認線上版本用 `curl -fsSL https://socrates.driseam.com/api/release`
的 `source_sha`。

下方第 2、3、6、7 節是用 `docker compose`（`compose.yml`、`up.sh`、`update.sh`）在自架主機上部署的方式，
**不是目前 stage 的部署方式**，保留給自架或本機重現時使用。第 1 節的環境變數與第 4 節的 smoke 兩種方式都適用。

## 1. 準備一次性的環境資料

| 設定 | 提供方式 | 作用 |
|---|---|---|
| Docker Engine＋Compose v2 | 伺服器管理員 | 建置與啟動兩個容器 |
| PostgreSQL 專用資料庫 | `DATABASE_URL` | 持久化所有帳號、作答、課堂事件、積分，以及加密後的 provider 憑證 |
| Resend API | `RESEND_API_KEY`／`RESEND_FROM`／`RESEND_WEBHOOK_SECRET` | Email 驗證、忘記密碼；註冊後由郵件連結啟用 |
| LLM | 不需伺服器設定 | 由教室擁有者在 app 內設定 provider profile（openrouter／openai／anthropic／gemini／openai-compatible） |
| 研究搜尋（選用） | `SOCRATES_GOOGLE_CSE_ID`／`SOCRATES_GOOGLE_CSE_SCOPE` | 學生作答時的研究側欄（Google Programmable Search）；留空則關閉 |
| 現有 Tunnel 路由權限 | 管理員的 Cloudflare 帳號 | 將公開網域接到本機8080 |
| 建置主機對外 HTTPS | 能連到 `raw.githubusercontent.com`（備援 `api.github.com`） | 前端 image 在 build 期下載釘選版 avatar（CC-BY-NC-4.0，非商業教學用） |

應用僅對 host `127.0.0.1:8080`提供入口，資料庫由 backend 內部連接。
`DATABASE_URL` 的 hostname 應能從 backend 容器解析；host PostgreSQL 可用
`host.docker.internal`，Compose 已配置 Linux host-gateway。
郵件 key 留在伺服器 `.env`／credential store，GitHub source 只收 `.env.example`。

> **`DATABASE_URL` 一旦使用就不要改寫。** 教室擁有者存的 provider 憑證以 `DATABASE_URL`
> 字串衍生的金鑰加密（`backend/app/api/routes/provider_profiles.py`）。改密碼、換主機別名、
> 改編碼或參數，即使指向同一個資料庫，既有憑證都會解不開（`PROVIDER_CREDENTIAL_DECRYPTION`，503），
> 擁有者必須重新輸入。k8s Secret 裡的 `DATABASE_URL`（以及自架時 `deploy/stage/.env` 的值）
> 換環境時也必須逐字相同。

### LLM 與 fallback

Live LLM 的呼叫走教室擁有者帳號下的 provider profile（預設 profile，失敗再試 fallback profile）。
沒有可用的 profile，或任何一層額度用完時，job 不會一直等待，並在 audit 記錄
`fallback_used=true`：

- 聚焦追問：導師暫停回應，全班看到原因（額度已達上限／擁有者尚未設定 LLM／LLM 暫時無法連線），討論停在這一輪，等老師按「下一步」才繼續
- 動態題：產生一題固定的「換一個條件，你的選擇會改變嗎？」
- 題目／班級／個人總結：固定說明文字

### 郵件

Stage 預設 `SOCRATES_MAIL_TRANSPORT=resend`，只需 Resend 的三個值。
`RESEND_API_KEY` 未設定時部署不會失敗，Email 驗證回 `RESEND_API_KEY_REFERENCE_REQUIRED`。

改用 SMTP（例如 Resend SMTP）時，backend 必須明確設定 `SOCRATES_MAIL_TRANSPORT=smtp`，
以及 `SMTP_HOST=smtp.resend.com`、`SMTP_PORT=587`、`SMTP_STARTTLS=true`、
`SMTP_USER=resend`、`SMTP_PASSWORD`（Resend API key）與 `SMTP_FROM`
（Resend 已驗證網域下的寄件地址）。只有 SMTP 憑證並不會啟用 SMTP transport。

驗收應確認 outbox 的 `state=SENT` 與 delivery 的 `provider`（預設 `resend`，改用 SMTP 時為 `smtp`）、
`provider_status=ACCEPTED`，再確認收件；登入和健康檢查成功並不等於信已寄出。
啟用前先檢查既有 outbox 的測試收件人與過期驗證信；恢復 worker 會處理到期佇列。

### Kubernetes

stage 目前的部署路徑（見最上方〈目前的部署方式〉）。transport 放進 backend Deployment 的環境變數，
憑證放進 SOPS Secret。Secret 的 `envFrom` 更新後須重啟 backend，才會載入新值。

### Avatar

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
# 用伺服器的安全編輯器填入 DATABASE_URL 與 RESEND_*（研究搜尋選用）。
bash deploy/stage/preflight.sh
bash deploy/stage/up.sh
```

Backend 啟動時執行 Alembic 升版，再啟動2個 Uvicorn workers；frontend 使用 Nginx，
`/api/*` 及 WebSocket upgrade 轉交 `backend:8000`。

每個 worker 有兩個資料庫連線池：教室模組的引擎（`pool_size=5`＋`max_overflow=5`）與 Round 1 路由
使用的引擎（SQLAlchemy 預設 5＋10，有流量才連線），另有一條專用 LISTEN 連線。
最壞情況約每 worker 26 條、預設 2 個 worker 共約 52 條；請依同機其他服務預留資料庫 connection budget。

預期：`/api/v2/readiness` 回傳 `status=ready,database=connected`，兩個服務為 running。

```bash
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml ps
curl -fsS http://127.0.0.1:8080/api/v2/readiness
curl -fsS http://127.0.0.1:8080/api/release
```

`preflight.sh` 在建置前就擋下不完整的 checkout／環境：缺 `docker`／`git`／`curl`／`python3`、
Docker daemon 沒起來、`deploy/stage/.env` 不存在或 `DATABASE_URL` 還含有 `REPLACE_ME`、
缺 `frontend/package-lock.json`、`scripts/gen_types.sh` 沒有執行位元、或 avatar 來源連不到，
都會在這一步失敗而不是 build 到一半才爆。`RESEND_API_KEY` 空白只會警告。

部署驗收要求下面兩條都通過：

```bash
bash deploy/stage/smoke.sh
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml exec backend python -m alembic current
```

`smoke.sh` 依序檢查：前端首頁回應、`/api/v2/readiness` 為 `status=ready`、
空白的 `POST /api/v2/auth/login` 回 422 且內容為帶 `detail` 的 JSON（確認 API 路由與來源檢查）、
`/__bh__/current.json` 含 `source_sha`。成功時印出 `STAGE_JSON_AUTH_ROUTE_PASS`。
`alembic current` 預期只有一行 `(head)`；目前的 head 是 `0010`。

## 3. 接入既有 Tunnel

由 Tunnel owner 將下列hostname route加入現有 ingress，再使用自己的服務管理程序重載：

```yaml
- hostname: socrates.driseam.com
  service: http://127.0.0.1:8080
```

Cloudflare DNS／Tunnel 綁定由該環境的 owner 執行，保留其他既有 hostname 路由。
本配置的 cloudflared 在host執行；containerized cloudflared可使用能抵達frontend的同網路service位址。

```bash
curl -fsS https://socrates.driseam.com/api/v2/readiness
curl -fsS https://socrates.driseam.com/api/release
```

## 4. 最小公開 smoke

教師註冊→郵件驗證→登入→教師模式→建立／儲存劇本→建立教室→分享課程碼。
學生註冊／驗證→加入教室→填匿名名。教師開始後依序3-2-1、作答、5秒分布、代表追問、總結。
教師也能切學生模式加入自己的教室，以一個帳號完成單人試玩。
同一教室內教師權限由 creator 判定；Cookie＋伺服器 membership 決定實際權限。
要測 live LLM，教室擁有者需先在「LLM 設定」建立 provider profile。

每一題可設秒數（預設90）、選項、argument_required、追問上限（預設3）、反應積分上限。
`dynamic` 模式使用初始題，後續題由LLM生成並提供預設8秒教師preview，時間到自動採用。
沒有 LLM 或額度用完時，動態題與總結以固定內容完成（見第 1 節「LLM 與 fallback」）。

## 5. CI／Release

stage push 走 CI。CI的backend、frontend、contract、Round1、教室負載（`classroom-load`）皆成功後，
呼叫同一revision的Stage Release。Release.json以image digest固定來源與相依lock，
image 以 `sha-<source sha>` 與 `stage-<時間戳>-<source sha>` 標記。Flux 追 `stage-*` tag 自動部署
（見最上方〈目前的部署方式〉）。

CI 原本還有一個 `deploy` job（`stage-deploy.yml`，要在 stage 主機上跑 self-hosted runner，
並由 `SOCRATES_STAGE_RUNNER_ADMITTED` 開啟）。它從未執行過——repo 一直沒有 runner 也沒設該變數——
永遠顯示 Skipped，讓人誤以為 push 不會部署。2026-10-05 已刪除。

兩個應用容器保持2個；郵件與DB為外部服務。CI 上傳建置時使用的 `frontend/package-lock.json`，
Release 沿用同一份 lock。

## 6. 更新與資料保留

```bash
bash deploy/stage/update.sh
```

資料庫升版前由DB owner依既有備份程序保存資料庫快照。
应用回版使用已記錄、與當前schema相容的前一組image digests；所有資料保留於PostgreSQL。
將 `BACKEND_IMAGE`／`FRONTEND_IMAGE` 填為已驗證digest，並把 `SOCRATES_SOURCE_SHA` 設為那組 image
的來源 SHA（取自 `RELEASE.json` 的 `source_sha` 或 image 的 `sha-<source sha>` tag），再執行（自架主機；k8s 的退版見最上方）：

```bash
export SOCRATES_SOURCE_SHA=<回版 image 的來源 SHA>
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml pull
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml up -d --no-build
```

沒有 export 時，compose 會用 `.env` 的值，`/api/release` 會顯示錯誤的版本。
Schema演進使用明確資料遷移，migration downgrade會交由資料owner處理。

## 7. 運維與狀態回覆

```bash
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml logs --tail 100 backend frontend
```

| 現象 | 最小操作 |
|---|---|
| 等待Email | 確認 Resend key、寄件網域設定與收件匣；mail outbox持續重送 |
| 導師暫停回應，或動態題、總結變成固定內容 | 確認教室擁有者已設定可用的 provider profile、供應商額度與班級budget |
| 班級budget用完 | creator可POST `/api/v2/classrooms/{id}/budget?live_llm_call_budget=60`，附session與CSRF。實際上限取此值與帳號路由 `max_calls`（預設 240）的較小者；教師額度預設 240 |
| 研究側欄顯示尚未綁定搜尋引擎 | 設定 `SOCRATES_GOOGLE_CSE_ID` 後重啟 backend |
| WebSocket反覆重連 | 核對Tunnel、Nginx Upgrade headers、public origin與Cookie HTTPS設定 |
| DB readiness | 由backend容器檢視DB hostname、帳密、Alembic及網路路由 |
| provider 憑證 503 | `DATABASE_URL` 字串與存入憑證時不同；改回原字串，或請擁有者重新輸入 |

回給Arthur：stage commit、CI run URL、兩容器image IDs、public readiness與release回應、
一位教師＋一位學生完整題目smoke結果。Credentials保留於credential store。

2×60容量驗收在專用CI資料庫與兩worker上進行（`scripts/classroom_load.py`）。20ms controlled、
100–150ms public是測量目標；請讀實際receipt中的延遲資料與適用網路範圍。此README本身提供部署程序。

## 歷史紀錄：2026-09-24 首次發佈

首次發佈由 Loom 執行：source commit 以 `[skip ci]` 先發布、回讀遠端，再以**相同 Git tree**
的 CI 啟動 commit 觸發 CI；工具鏈遷移的 lock 也在那次建立。Source publication、CI 結果、
image publication、public adoption 各有獨立 receipt。之後一般 stage push 直接走第 5 節的流程。

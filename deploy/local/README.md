# Socratic Local Dev

> 團隊日常開發用根目錄的 `docker-compose.yml`（前端 5173、後端 8000、PostgreSQL 5432，見根目錄 README）。
> 本目錄是另一套獨立的本機 stack（Docker project `socrates-local`），供 Portal 卡片啟動。

日常入口：arthur.wsl → wb → Portal → Socratic。
Portal owner一次採用接入adapter後，卡片會呼叫固定domain launcher，ensure frontend/backend與local PostgreSQL，再跳轉實際loopback URL。

Source：~/.config/bh-socratic/local.json 的repo指向Arthur canonical current worktree。
Runtime：Docker project socrates-local；frontend HMR，backend reload；資料庫用具名volume。
左mic／右Enter共用文字與語音draft。Stage source與外部DB/Tunnel保持独立。

## 不用 launcher 直接啟動

```bash
docker compose -p socrates-local -f deploy/local/compose.yml up -d --build
```

開 <http://127.0.0.1:18980>（埠號可用 `SOCRATES_LOCAL_PORT` 改）。

## Launcher

原始碼是 `scripts/socratic_local_launch.py`（`ensure`／`status`）。repo 內沒有安裝步驟；
`~/.local/bin/socratic-local-launch` 是各機器自行放置的入口。設定檔預設
`~/.config/bh-socratic/local.json`，必填 `repo`（worktree 路徑）與 `port`，選填 `project`（預設 `socrates-local`）、`state_dir`、`build_timeout`。

本機launcher的診斷入口：
```bash
~/.local/bin/socratic-local-launch status
```
此入口供診斷；日常使用維持wb Portal card。

## 郵件與 LLM

- **郵件固定為 fixture，不會真的寄出。** `deploy/local/compose.yml` 在 `environment:` 寫死
  `SOCRATES_MAIL_TRANSPORT: fixture`，會蓋過 `deploy/local/.env`，所以 SMTP／Resend 設定在這裡沒有作用。
  驗證信與重設密碼信以預覽連結顯示在驗證頁；auth 語意與 production 相同。
- **LLM 由教室擁有者在 app 的「LLM 設定」建立 provider profile**，不是從 `.env` 讀 key。
  本機允許的自架端點（例如本機模型服務）由 `SOCRATES_PROVIDER_LOCAL_ALLOWLIST` 控制，
  預設 `127.0.0.1,localhost,host.docker.internal`。

Web Speech採browser capability與麥克風許可，文字輸入持續可用。

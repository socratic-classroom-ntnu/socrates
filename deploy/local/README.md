# Socratic Local Dev

日常入口：arthur.wsl → wb → Portal → Socratic。
Portal owner一次採用接入adapter後，卡片會呼叫固定domain launcher，ensure frontend/backend與local PostgreSQL，再跳轉實際loopback URL。

Source：~/.config/bh-socratic/local.json 的repo指向Arthur canonical current worktree。
Runtime：Docker project socrates-local；frontend HMR，backend reload；資料庫用具名volume。
左mic／右Enter共用文字與語音draft。Stage source與外部DB/Tunnel保持独立。

本機launcher的診斷入口：
```bash
~/.local/bin/socratic-local-launch status
```
此入口供診斷；日常使用維持wb Portal card。

SMTP、OpenRouter可從deploy/local/.env安全填入。Email驗證與密碼重設沿相同production auth語意。
Web Speech採browser capability與麥克風許可，文字輸入持續可用。

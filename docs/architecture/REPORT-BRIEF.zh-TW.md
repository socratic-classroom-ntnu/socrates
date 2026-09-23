# Socrates 報告速記｜CE Stage 交付候選

## 30 秒

Socrates 使用 React 與 TypeScript 製作前端，FastAPI 提供 API，PostgreSQL 保存對話。Orchestrator 掌握情境與推進，TutorGateway 取得導師文字與觀察。學生訊息先進資料庫，再呼叫 provider。對外使用 Nginx 統一頁面與 `/api` 入口，再透過 Cloudflare Tunnel 公開。Stage 交付兩個 application containers，資料庫與 Tunnel 由伺服器環境提供。

## 圖解

```text
Browser: React / TypeScript / CE portrait
    → HTTPS / Cloudflare Tunnel
    → Nginx: frontend container
        /        → SPA
        /api/*   → FastAPI: backend container
                       Router → Service → Orchestrator
                                            ├→ TutorGateway → ScriptedProvider
                                            └→ Repository → SQLAlchemy → PostgreSQL
```

React 是畫面函式庫；Rsbuild 是 build/dev tool；Jest/SWC 是測試工具。建置後由 Nginx 供應 HTML/JS/CSS/GLB。工具鏈遷移的實際採用以新 source SHA 與 build receipt 為準。

## 資料庫

Learner 1:N Session。每個 Session 擁有 Messages、StageProgress、TranscriptDraft 與 InteractionEvent；Summary 為每場對話 0..1 筆。Session 的 status／flow_state 掌握事實；各情境成果為 goal_met、capped、stopped_early、skipped。Alembic 負責 schema migration。

## API 與一次互動

Frontend `POST /api/sessions/{id}/messages`，附 browser-local `X-Learner-Id`，Router 驗證輸入，Service 先保存學生訊息，再呼叫 Orchestrator → TutorGateway。Reply 與 observations 回來後，系統更新訊息及情境狀態，回傳 available_actions。React 重新讀取 RoomView，以狀態呈現人像、對話框和按鈕。

API family：sessions、messages、advance、retry、end、summary、room、history、transcript-drafts；操作狀態由 health／release 提供。OpenAPI 由 FastAPI schema 生成，TypeScript 型別沿同一契約生成。

## Demo 能力範圍

目前 provider 為固定腳本，適合課程演示與可重現旅程。真實 LLM 使用相同 provider boundary 接入；人像的 audio／viseme 由 Portal-Goose 後續整合。UUID 是瀏覽器紀錄識別，正式帳號驗證屬後續版本。

## 常見問答

**為何分離流程和模型？** 教學狀態可重現與測試，換模型時仍沿用同一流程。

**為何只有兩個容器？** frontend 與 backend 是本專案的應用交付；DB 與 Tunnel 是外部環境責任。

**為何先保存學生文字？** provider timeout 後仍可從已保存訊息續接。

**如何判斷伺服器採用了哪版？** 比對部署使用的 Git SHA、images、`/api/release` 與公開核心旅程；image build、CI、伺服器上線分開回報。

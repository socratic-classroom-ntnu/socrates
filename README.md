<!-- SOCRATES_STAGE_OPERATOR -->
## 伺服器組員：從這裡架設 Stage

部署分支為 `stage`。完整步驟請讀 [Stage 部署指南](deploy/stage/README.md)。
Round 1 的展示架構與講稿（2026-09-24）：[報告速記](docs/architecture/REPORT-BRIEF.zh-TW.md)；教室（多人課堂）架構見 [CLASSROOM-ARCHITECTURE](docs/CLASSROOM-ARCHITECTURE.md)。

### 人像開發測試：既有錄音重播

共享 `TutorAvatar` 的開發選單使用「重播既有錄音對話」，`product="ce"` 與 `product="socratic"` 沿用同一 presenter 與各自的模型許可篩選。此測試不呼叫 LLM、TTS、STT 或 browser SpeechSynthesis；正式教室的文字對話與既有語音行為不在此次切換範圍。

錄音來源為歷史 `Portal-Goose-avatar-azure-fixture.zip`，package SHA256 `e07766c3411535271db91c8cb9d30c04a1855cd0d461dde46b05ef2e4fa433cc`；原件位於 `/mnt/d/Work/Obsidian/BH/TEMP/Portal-Goose/avatar-fixture/`，逐位元複本與 custody receipts 收於 `frontend/public/avatar-fixtures/coffee-shop/`。原句、聲音 `en-US-GuyNeural`、90 筆 visemes、31 筆 word timings 均來自同一錄音，非 CE Jenny 的 multi-segment fixture。

`recordedDialogue.ts` 在解碼前比對四份原件 SHA256（音訊為 `6cc2b782be71a9a2767574ae65f3b50c2537928b8cf21f2d6eb7d4b182321ab3`），由 `PackPresenter.play(AudioBuffer, events)` 交給既有 `AudioLane` 音訊時鐘；資料失配或越界直接失敗，不生成靜音、不估算嘴型、不降級成 audio-only 成功。畫面明示錄音原文、聲音及 replay state；`ENDED` 只是播放結束，不是人類驗收。

播放用的 `AudioContext` 在重播點擊內同步解鎖，再下載與解碼錄音；停止不等待未完成的 `resume()`，晚到的解鎖不得重新啟動已取消音訊。即使結束幀回呼失敗，播放 Promise 仍會拒絕；停止仍會終止 source，`dispose()` 仍可關閉 context，不留永久等待。

掛載時已有的舊導師訊息不自動重播；掛載後第一則新訊息無論是否正在錄音都能發話。模型仍在載入時不消費新訊息，等人像載入完成後才開始發話與嘴型；模型選擇與導師訊息同批變更時，ready 必須綁定目前 product、requested pack ID 與已載入的 selection，不能使用舊 presenter 的 ready。Round 1 以 session ID 加訊息 seq 辨識發話，學生追加訊息不會重播舊提問；focus 共思舞台沿用目前 focus 的真導師訊息。錄音期間到達的新訊息會在錄音完成後接續。關閉語音或切換模型會停止音訊，並明確顯示 `STOPPED`，不把取消留在 `loading`。語音關閉時禁止再啟動錄音重播，重新開啟語音才恢復播放操作。

模型仍取自既有 Portal catalog／GLB：`/mnt/d/Work/Obsidian/BH/Portal/avatar-serve/`，部署須保留 same-origin `/avatar-packs/` 的唯讀掛載。Raven 的 Vite Source preview 不會自行包含這個外置資產根；不可用 custody JSON 或改寫產品授權來代替真正模型。

Source 修改、部署採用與人類驗收分開：整合者須另跑 frontend 測試／build，並在實際產品頁親驗可聽音訊、audio-clock 嘴型、停止／換模型與兩種 product 的篩選；此來源收據不宣稱已部署或已驗收。


# 蘇格拉底式對話機器人

一個會反問你的哲學課堂。

它丟出道德兩難情境，讓你表態，然後追問理由、變更條件、測試你的原則撐不撐得住——
最後給你一面鏡子：**你剛剛的選擇，背後其實是這樣一套道德標準。**

靈感來自哈佛公開課「Justice：一場思辨之旅」（Michael Sandel）。那門課的特徵是
教授從不給答案，只丟情境與追問；學生在一次次被反問中，逐漸看清自己原本就持有、
卻從未說清楚的立場。（本專案與該課程及哈佛大學並無關聯。）

## 核心理念：照見，不是問倒

這是整個產品最重要的一句話，所有設計決策都從它推導出來。

> 這門課沒有要教會你們任何新的知識，它的目標只有協助讓你意識到你原本就已經知道的事情。

機器人不是要把學生逼到啞口無言。它是要讓學生從自己的回答裡，認出自己實際採用的原則、
以及那個原則會在哪裡站不住。

兩個直接的後果：

- **學生說「我說不上來」是成功，不是失敗。** 發現自己原則的邊界，正是目的。
- **最後的總結是交付物，不是附錄。** 前面問得再精彩，鏡子不到位就沒有意義。

## 一段對話長什麼樣

> **教授**：你是一輛電車的司機，時速六十英里。前方軌道上有五名工人⋯⋯
> 你可以把電車轉向岔道，撞死那一個人，救下那五個人。你會怎麼做？
>
> **學生**：我會轉向。
>
> **教授**：所以你會把電車轉向。為什麼？
>
> **學生**：因為五條命比一條多。
>
> **教授**：一條命換五條命——你用的是數量。那如果岔道上站的是一百個人，
> 而直行只會撞到一個人呢？

系統在背後判斷的不是「答得對不對」，而是三件事是否同時成立：**你表態了嗎、
說得出理由嗎、那個理由被挑戰過並且你回應了嗎**。三者齊備才算「這一關你看清楚了」。

沒被挑戰過的表態只是直覺，不是已經照見的立場。

## 目前的狀態

網站有兩個入口，目前主力開發的是教室（多人課堂）。

**教室：多人課堂（網站根目錄 `/`）**

- 帳號註冊、Email 驗證、忘記密碼；教師建立劇本與教室，學生以課程碼加入
- 課堂流程：倒數、作答、選項分布、代表學生與導師的聚焦討論、題目／班級／個人總結；
  可選 `dynamic` 模式由模型產生後續題目，也可加入 AI 學生
- 導師由教室擁有者在「LLM 設定」建立的 provider profile 驅動；沒有可用的 LLM 或額度用完時，
  改用固定內容完成

**Round 1：單人三階情境（`/round1`，目前擱置不開發）**

- 電車難題三階情境、路口推進、達上限、總結與歷史紀錄都可以走完
- **教授的回覆是固定腳本**。你打什麼內容，回應都一樣——這是為了讓驗收可重現
- 免註冊，身分存在瀏覽器裡。換裝置或清掉網站資料，紀錄就找不回來

## 跑起來

```bash
docker compose up -d
```

開 <http://localhost:5173> 是教室的登入頁；本機不會真的寄信，註冊後驗證頁會直接顯示驗證連結。
Round 1 的單人流程在 <http://localhost:5173/round1>。三個服務：前端 5173、後端 8000、PostgreSQL 5432。

```bash
docker compose exec backend python -m pytest tests -q   # 後端測試
cd frontend && npm test -- --runInBand                  # 前端測試
```

後端測試會自己用獨立的 `socrates_test` 資料庫，不會動到你的開發資料。

**第一次 clone 下來，在 repo 根目錄跑一次 `npm install`**，啟用 git hook（husky）：
commit 前自動跑有變更部分的 lint/typecheck，push 前自動跑滿整組（比照 CI）。
push 前 backend 容器要是開著的（`docker compose up -d`），`pre-push` 會用
`docker compose exec` 跑後端檢查，容器沒開會直接擋下並提示。

## 接下來讀什麼

| 你是 | 從這裡開始 |
|---|---|
| 要動手改程式 | [`AGENTS.md`](AGENTS.md)——不可妥協條款與範本索引，動手前必讀 |
| 新加入團隊 | [`docs/onboarding.md`](docs/onboarding.md)——六站閱讀路徑，順序是刻意排的 |
| 想理解產品 | [`docs/product/product-overview.md`](docs/product/product-overview.md) |
| 要驗收 Round 1 三階腳本 | [`docs/testing/trolley-round1-acceptance.md`](docs/testing/trolley-round1-acceptance.md) |
| 想理解教室（多人課堂） | [`docs/CLASSROOM-ARCHITECTURE.md`](docs/CLASSROOM-ARCHITECTURE.md) |
| 想理解實作 | [`docs/superpowers/specs/2026-09-19-socratic-tutor-design.md`](docs/superpowers/specs/2026-09-19-socratic-tutor-design.md) |


## 技術

React + TypeScript + Vite · FastAPI · PostgreSQL · Docker Compose

對話的推進由後端的狀態機決定，不交給語言模型——「現在第幾階」是事實不是判斷，
而且換一家模型不該改變闖關的節奏。模型只負責產生教授的話，以及回報對學生的觀察。

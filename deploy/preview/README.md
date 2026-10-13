# Socrates 教室 — PR 預覽環境

每個 PR 都可以有一個自己的網站：`https://pr-<PR 編號>.socrates.driseam.com`。
它有**獨立的 namespace 與資料庫**，和 dev／QA／正式環境完全分開，PR 關掉就整個刪除。

## 怎麼開

**什麼都不用做。** 新開的 PR 會自動被貼上 label **`preview`**：

1. `Preview` workflow（`.github/workflows/preview.yml`）把 PR 最新 commit 建成 image，
   tag 是 `sha-<PR head sha>`，約 5–10 分鐘。
2. k8s 上的 Flux Operator 每 3 分鐘掃一次有 `preview` label 的 PR，
   幫它建好整套環境（flux-k8s 的 `apps/base/socrates-preview`）。
3. PR 裡會有一則**可以直接點的網址**與測試帳號。每次 push 都會更新同一則留言，不會洗版，
   並寫清楚是哪個 commit：
   - ⏳ 一 push 就顯示「正在建置 `新 commit`」，以及網站目前仍是哪個 `舊 commit`
   - ✅ 網站換上新 commit 之後改成「已部署最新 commit」
   - ❌ 建置失敗會附上 workflow log，網站維持舊版

**不需要預覽**就把 `preview` label 拿掉，環境會在幾分鐘內刪除；要恢復就再加回去。
自動加 label 只套用在新開的 PR，舊的 PR 想要預覽就自己加。

之後每次 push 到這個 PR，都會重建 image 並換上新版。**資料庫不會清空**；要從頭來就把 label 拿掉、等環境刪掉後再加回去。

同時最多 6 個預覽環境。Fork 來的 PR 推不了 image，不能預覽。

## 預設帳號（factory 資料）

新資料庫啟動時，`scripts/seed_preview.py` 會建好以下帳號，**密碼都是 `preview-password`**，
而且都已經完成 Email 驗證：

| 帳號 | 身分 | 說明 |
|---|---|---|
| `teacher001` | 老師 | 擁有教室 `PREVIEW1`，`user001`–`user010` 已經在裡面 |
| `teacher002`、`teacher003` | 老師 | 各自擁有空教室 `PREVIEW2`、`PREVIEW3` |
| `user001`–`user030` | 學生 | `user011` 之後尚未加入任何教室，可以用課程碼自己加入 |

用帳號名稱或 `<帳號>@preview.invalid` 都能登入。這份腳本只在
`SOCRATES_ENVIRONMENT` **明確設定**為 `preview` 或 `local-dev` 時才會執行（沒設也會拒絕），不會在 QA 或正式環境建出這些帳號。

## 不能寄信，也不能用 LLM（除非申請）

預覽環境預設**拿不到任何密鑰**：

- **寄信**：走 `fixture`，信不會寄出，畫面上會直接顯示驗證連結（`preview_url`）。
- **LLM**：沒有 `OPENROUTER_API_KEY`，需要 AI 的地方會停在「等待金鑰」。
  使用者在畫面上自己填的 provider 金鑰仍然可以用（那是他自己的金鑰）。

PR 裡的程式碼還沒有被 review，所以不能直接拿到共用的金鑰。

### 申請方式

1. 在 PR 留言說明**為什麼需要**、**要測什麼**，並 tag 核心組成員。
2. 核心組確認後，替 PR 加上 label：
   - **`preview-llm`**：給一把**低額度的預覽專用** OpenRouter 金鑰，每日 LLM 預算 20 次。
   - **`preview-mail`**：改用真的 SMTP 寄信（只寄得到你填的信箱，請用自己的信箱測試）。
3. 環境會在幾分鐘內自動重啟並帶上金鑰。測完請把 label 拿掉，金鑰就會從環境中移除。

只有對 repo 有 triage 以上權限的人才能加 label，所以加 label 這個動作本身就是核准。

## 排查

```bash
curl https://pr-<編號>.socrates.driseam.com/api/release      # backend 跑的是哪個 commit（source_sha）
curl https://pr-<編號>.socrates.driseam.com/revision.json    # frontend 跑的是哪個 commit
kubectl -n socrates-pr-<編號> get pods                 # 環境有沒有起來
kubectl -n socrates-pr-<編號> logs deploy/backend      # migration、seed、啟動訊息
kubectl -n flux-system get resourceset socrates-previews
kubectl -n flux-system get resourcesetinputprovider socrates-prs -o yaml   # 目前掃到哪些 PR
```

pods 停在 `ImagePullBackOff`，通常是 `Preview` workflow 還沒跑完，或跑失敗了。

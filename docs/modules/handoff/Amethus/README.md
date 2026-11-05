# Amethus 的交接包（D 包：對接）

| 項目 | 內容 |
|---|---|
| 你負責的模組 | contract（後端） |
| 你的根分支 | `backend/Amethus/main` |
| PR 目標 | `backend/main` |
| 工作清單 | [TASKS.md](TASKS.md) |

你負責前後端之間唯一的接縫，讓前端只用產生出來的型別、不手寫。這一輪 Ken 和 Courecta 會新增十幾個端點，每一個都要經過你審。你不寫業務邏輯。

## 第一天：照這個順序
1. **認識產品**：讀 repo 根目錄的 `README.md`，從開頭讀到「接下來讀什麼」。
2. **跑起來**：
   - 在 repo 根目錄跑一次 `npm install`，啟用 git hook。
   - 跑 `docker compose up -d`。
   - 跑 `docker compose exec backend python -m pytest tests -q`，確認全綠。
3. **讀規則**：`AGENTS.md` 的「不可妥協條款」「API 慣例」「分支流程」三節。
4. **讀你要讀的文件**：
   - `docs/modules/backend/contract.md`、`docs/modules/frontend/contract.md`
   - `docs/modules/README.md` 的「契約」表與「唯一接縫」
   - `docs/classroom/NEW-FEATURES.md` 第 4 節（API 關係）
5. **讀 [TASKS.md](TASKS.md)**，在團隊 Discord 回報你的第一個 PR 要做什麼。

## 分支與 PR
- 你的根分支是 `backend/Amethus/main`，已經建好。`backend/Amethus/` 底下可以自由開分支，例如 `backend/Amethus/<主題>`。
- 做完 [TASKS.md](TASKS.md) 裡的一項，就從 `backend/Amethus/` 底下的分支開 PR 到 `backend/main`。一個 PR 對應一項 task。沒有特別允許的話，PR 只開到 `backend/main`。
- Arthur 審完後合進 `backend/main`，再以功能為單位打包成 PR 給 `develop`。
- `backend/main` 有新東西時（例如別人的契約合進來了），先 merge 進 `backend/Amethus/main` 再繼續做。
- 這個資料夾 `docs/modules/handoff/Amethus/` 在 `backend/main` 上，每人一個；要改內容請另外和 Arthur 說，不要混在功能 PR 裡。

## 你和誰有接縫
| 對象 | 你給對方／對方給你 | 什麼時候 |
|---|---|---|
| Ken（B 包） | 審對方每個新端點：response_model、reason code、型別重產；你給對方雷達契約、統整引用型別 | 每個新端點；Ken 做雷達與引用之前 |
| Courecta（C 包） | 審對方每個新端點；和對方一起定統整引用型別與 TTS 契約 | 每個新端點；Courecta 定 schema、做語音時 |
| Hsy（A 包） | 審對方補的 response_model；給對方雷達契約 | Hsy 補 response_model、第二版 |
| 前端 | 前端缺欄位時會寄契約請求給端點所屬模組的負責人，你負責把請求轉到正確的人 | 隨時 |

## 交接完成的定義
- 能在本機跑起後端，並通過 [TASKS.md](TASKS.md) 最後的檢查。
- 讀完上面的文件，在團隊 Discord 認領第一個 PR。

## 參考
- 四包總覽與跨包流程：[`docs/modules/handoff/README.md`](../README.md)
- 六項新功能的跨包總表：`docs/classroom/NEW-FEATURES.md`

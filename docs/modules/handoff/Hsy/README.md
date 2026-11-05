# Hsy 的交接包（A 包：課堂）

| 項目 | 內容 |
|---|---|
| 你負責的模組 | classroom-core、group-dialogue、analytics（後端） |
| 你的根分支 | `backend/Hsy/main` |
| PR 目標 | `backend/main` |
| 工作清單 | [TASKS.md](TASKS.md) |

你負責全班課堂與分組課。這一輪的六項新功能主要落在單人活動（Ken、Courecta 那兩包），所以你先清現有待辦；等單人活動的旗標上線後，再把同一套旗標、指標和雷達接到分組課（第二版）。

## 第一天：照這個順序
1. **認識產品**：讀 repo 根目錄的 `README.md`，從開頭讀到「接下來讀什麼」。
2. **跑起來**：
   - 在 repo 根目錄跑一次 `npm install`，啟用 git hook。
   - 跑 `docker compose up -d`。
   - 跑 `docker compose exec backend python -m pytest tests -q`，確認全綠。
3. **讀規則**：`AGENTS.md` 的「不可妥協條款」「API 慣例」「分支流程」三節。
4. **讀你要讀的文件**：
   - `docs/modules/backend/classroom-core.md`、`group-dialogue.md`、`analytics.md`
   - `docs/classroom/STATE-MACHINE.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`
   - `docs/classroom/NEW-FEATURES.md` 第 0–2 節（了解整體；你的部分在第二版）
5. **讀 [TASKS.md](TASKS.md)**，在團隊 Discord 回報你的第一個 PR 要做什麼。

## 分支與 PR
- 你的根分支是 `backend/Hsy/main`，已經建好。`backend/Hsy/` 底下可以自由開分支，例如 `backend/Hsy/<主題>`。
- 做完 [TASKS.md](TASKS.md) 裡的一項，就從 `backend/Hsy/` 底下的分支開 PR 到 `backend/main`。一個 PR 對應一項 task。沒有特別允許的話，PR 只開到 `backend/main`。
- PR 有新增或修改端點時，送出前照[新端點契約檢查表](../../../../backend/app/modules/contract/NEW_ENDPOINT_CHECKLIST.md)「端點作者：提交前」逐項做，PR 說明附上它要的驗證證據。
- Arthur 審完後合進 `backend/main`，再以功能為單位打包成 PR 給 `develop`。
- `backend/main` 有新東西時（例如別人的契約合進來了），先 merge 進 `backend/Hsy/main` 再繼續做。
- 這個資料夾 `docs/modules/handoff/Hsy/` 在 `backend/main` 上，每人一個；要改內容請另外和 Arthur 說，不要混在功能 PR 裡。

## 你和誰有接縫
| 對象 | 你給對方／對方給你 | 什麼時候 |
|---|---|---|
| Courecta（C 包） | 給你：PersonalTutorTurn 加上 flags | 第二版開工前 |
| Ken（B 包） | 給你：solo-activity 的指標純函式（直接重用，不另寫一份） | 第二版開工前 |
| Amethus（D 包） | 給你：雷達契約；審你新端點的 response_model 與型別重產 | 你補 response_model、第二版接雷達時 |

## 交接完成的定義
- 能在本機跑起後端，並通過 [TASKS.md](TASKS.md) 最後的檢查。
- 讀完上面的文件，在團隊 Discord 認領第一個 PR。

## 參考
- 四包總覽與跨包流程：[`docs/modules/handoff/README.md`](../README.md)
- 六項新功能的跨包總表：`docs/classroom/NEW-FEATURES.md`

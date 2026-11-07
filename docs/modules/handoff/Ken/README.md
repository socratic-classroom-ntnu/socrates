# Ken 的交接包（B 包：課程、單人活動與底層）

| 項目 | 內容 |
|---|---|
| 你負責的模組 | course-management、solo-activity、content-authoring、platform、app-shell（後端） |
| 你的根分支 | `backend/Ken/main` |
| PR 目標 | `backend/main` |
| 工作清單 | [TASKS.md](TASKS.md) |

你負責課程與單人活動，六項新功能的呼叫端大多在你這包。你用到的 LLM 型別、訪客帳號與 embedding 都由 Courecta 先開契約 PR；契約還沒合進 `backend/main` 之前，你可以先照 NEW-FEATURES 的欄位寫測試和 migration。

## 第一天：照這個順序
1. **認識產品**：讀 repo 根目錄的 `README.md`，從開頭讀到「接下來讀什麼」。
2. **跑起來**：
   - 在 repo 根目錄跑一次 `npm install`，啟用 git hook。
   - 跑 `docker compose up -d`。
   - 跑 `docker compose exec backend python -m pytest tests -q`，確認全綠。
3. **讀規則**：`AGENTS.md` 的「不可妥協條款」「API 慣例」「分支流程」三節。
4. **讀你要讀的文件**：
   - `docs/modules/backend/course-management.md`、`solo-activity.md`、`content-authoring.md`、`platform.md`、`app-shell.md`
   - `docs/classroom/NEW-FEATURES.md` 全部（你的部分最多：第 3 節互動、第 4 節 API、第 5 節 migration）
   - `docs/classroom/PROMPT-DESIGN.md`（你呼叫的 program 的輸入與輸出）
5. **讀 [TASKS.md](TASKS.md)**，在團隊 Discord 回報你的第一個 PR 要做什麼。

## 分支與 PR
- 你的根分支是 `backend/Ken/main`，已經建好。`backend/Ken/` 底下可以自由開分支，例如 `backend/Ken/<主題>`。
- 做完 [TASKS.md](TASKS.md) 裡的一項，就從 `backend/Ken/` 底下的分支開 PR 到 `backend/main`。一個 PR 對應一項 task。沒有特別允許的話，PR 只開到 `backend/main`。
- PR 有新增或修改端點時，送出前照[新端點契約檢查表](../../../../backend/app/modules/contract/NEW_ENDPOINT_CHECKLIST.md)「端點作者：提交前」逐項做，PR 說明附上它要的驗證證據。
- CI 全綠就由你自己合進 `backend/main`。一個功能的模組改動都進了 `backend/main` 之後，Arthur 再一起審，並以功能為單位打包成 PR 給 `develop`。
- `backend/main` 有新東西時（例如別人的契約合進來了），先 merge 進 `backend/Ken/main` 再繼續做。
- 這個資料夾 `docs/modules/handoff/Ken/` 在 `backend/main` 上，每人一個；要改內容請另外和 Arthur 說，不要混在功能 PR 裡。

## 你和誰有接縫
| 對象 | 你給對方／對方給你 | 什麼時候 |
|---|---|---|
| Courecta（C 包） | 給你：ActivityExpansion、StanceClassification、SoloTutorTurn（含 flags）、FinalSummary、radar_* 型別；帳號 `kind`；`embed()`；引用驗證；到期訪客排程工作 | 各項開工前，對方先開契約 PR |
| Courecta（C 包） | 你給對方審：`modules.json` 裡 course-management 新增依賴 llm-runtime、ai-providers | 第 1 項的 PR |
| Amethus（D 包） | 審你每個新端點的 response_model、reason code、型別重產；給你雷達契約與統整引用型別 | 每個新端點；第 5、6 項開工前 |

## 交接完成的定義
- 能在本機跑起後端，並通過 [TASKS.md](TASKS.md) 最後的檢查。
- 讀完上面的文件，在團隊 Discord 認領第一個 PR。

## 參考
- 四包總覽與跨包流程：[`docs/modules/handoff/README.md`](../README.md)
- 六項新功能的跨包總表：`docs/classroom/NEW-FEATURES.md`

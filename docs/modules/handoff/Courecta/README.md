# Courecta 的交接包（C 包：帳號與 AI）

| 項目 | 內容 |
|---|---|
| 你負責的模組 | identity-access、ai-providers、llm-runtime（後端） |
| 你的根分支 | `backend/Courecta/main` |
| PR 目標 | `backend/main` |
| 工作清單 | [TASKS.md](TASKS.md) |

你這包是這一輪新功能的上游：LLM 的 schema、訪客帳號與 embedding 都從你這裡出來，Ken 的呼叫端會等你的契約。所以每一項都先開一個只放型別與函式簽名的小 PR，合進 `backend/main` 後，再補實作。

## 第一天：照這個順序
1. **認識產品**：讀 repo 根目錄的 `README.md`，從開頭讀到「接下來讀什麼」。
2. **跑起來**：
   - 在 repo 根目錄跑一次 `npm install`，啟用 git hook。
   - 跑 `docker compose up -d`。
   - 跑 `docker compose exec backend python -m pytest tests -q`，確認全綠。
3. **讀規則**：`AGENTS.md` 的「不可妥協條款」「API 慣例」「分支流程」三節。
4. **讀你要讀的文件**：
   - `docs/modules/backend/identity-access.md`、`ai-providers.md`、`llm-runtime.md`
   - `docs/classroom/PROMPT-DESIGN.md` 全部（你是它的負責人：schema、鐵則、評測）
   - `docs/classroom/LLM-OUTPUT-SCHEMA.md`
   - `docs/classroom/NEW-FEATURES.md`（第 3 節互動、第 4 節 API、第 5 節 migration）
5. **讀 [TASKS.md](TASKS.md)**，在團隊 Discord 回報你的第一個 PR 要做什麼。

## 分支與 PR
- 你的根分支是 `backend/Courecta/main`，已經建好。`backend/Courecta/` 底下可以自由開分支，例如 `backend/Courecta/<主題>`。
- 做完 [TASKS.md](TASKS.md) 裡的一項，就從 `backend/Courecta/` 底下的分支開 PR 到 `backend/main`。一個 PR 對應一項 task。沒有特別允許的話，PR 只開到 `backend/main`。
- PR 有新增或修改端點時，送出前照[新端點契約檢查表](../../../../backend/app/modules/contract/NEW_ENDPOINT_CHECKLIST.md)「端點作者：提交前」逐項做，PR 說明附上它要的驗證證據。
- Arthur 審完後合進 `backend/main`，再以功能為單位打包成 PR 給 `develop`。
- `backend/main` 有新東西時（例如別人的契約合進來了），先 merge 進 `backend/Courecta/main` 再繼續做。
- 這個資料夾 `docs/modules/handoff/Courecta/` 在 `backend/main` 上，每人一個；要改內容請另外和 Arthur 說，不要混在功能 PR 裡。

## 你和誰有接縫
| 對象 | 你給對方／對方給你 | 什麼時候 |
|---|---|---|
| Ken（B 包） | 你給對方：第 1 項的型別、第 4 項的帳號 `kind`、第 5 項的排程工作、第 6 項的 `embed()` | 各先開一個只放契約的小 PR |
| Ken（B 包） | 對方給你審：`modules.json` 裡 course-management 新增的兩條依賴 | Ken 的第一個 PR |
| Amethus（D 包） | 審你每個新端點的 response_model 與 reason code（`GUEST_EXPIRED`，在第一次 raise 它的 PR 裡加進 `REASON_CODES` 與前端文字）；和你一起定統整引用型別與 TTS 契約 | 每個新端點；第 1、8 項 |
| Hsy（A 包） | 你給對方：PersonalTutorTurn 加上 flags | Hsy 的第二版 |

## 交接完成的定義
- 能在本機跑起後端，並通過 [TASKS.md](TASKS.md) 最後的檢查。
- 讀完上面的文件，在團隊 Discord 認領第一個 PR。

## 參考
- 四包總覽與跨包流程：[`docs/modules/handoff/README.md`](../README.md)
- 六項新功能的跨包總表：`docs/classroom/NEW-FEATURES.md`

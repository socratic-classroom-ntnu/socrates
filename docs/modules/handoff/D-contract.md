# D 包：對接

模組：contract（後端）。負責人：Amethus

D 包負責前後端之間唯一的接縫，讓前端只需要用產生出來的型別，不用自己手寫。這一輪 B、C 包會新增十幾個端點，每一個都要經過你這包。

## 起點
- 分支：`backend/Amethus/main`（已經建好，內含為你訂製的交接包 `docs/modules/handoff/Amethus/`：README 與 TASKS）。做完一個功能就 PR 到 `backend/main`。
- 先讀：
  - [README.md](README.md) 的「第一次拿到這份文件」
  - `docs/modules/backend/contract.md`、`docs/modules/frontend/contract.md`
  - `docs/modules/README.md` 的「契約」表與「唯一接縫」
  - `docs/classroom/NEW-FEATURES.md` 第 4 節（API 關係）

## 範圍與現有待辦

### Contract（對接）（`contract`）
- 做什麼：收集各模組的契約，包括兩份 OpenAPI 的產生入口、reason code 目錄，以及還沒帶 response_model 的端點清單（`RESPONSE_MODEL_PENDING`，只能變短）。不放業務 model。
- 可寫的檔案：`backend/app/modules/contract/`；前端 `frontend/src/contract/`（前端 contract 模組）
- 依賴：全部模組（組裝層）
- 現有待辦：
  - 型別產生器為每個端點產出 request／response 型別。
  - 前端 client 依 path＋method 帶上型別。
  - 錯誤碼產成 TS 型別。
  - 和 A、B、C 包一起把 `RESPONSE_MODEL_PENDING` 清到 0（目前約 24 條，分散在各包）。

## 新功能工作

| 順序 | 做什麼 | 什麼時候做 |
|---|---|---|
| 1 | 建立「新端點檢查表」：B、C 包每個新端點的 PR，都要附上 response_model、reason code，並重產型別。你負責審這三項 | 開工當週 |
| 2 | 審 `GUEST_JOIN_DISABLED`、`GUEST_EXPIRED`、`EXPANSION_LOCKED`、`RADAR_NOT_READY` 四個新 code：每個新 code 由第一次 raise 它的 PR 一起加進 `REASON_CODES` 與 `frontend/src/contract/errorText.ts`（contract gate 要求目錄和程式裡實際 raise 的 code 完全一致，不預先登記）。你審目錄、前端文字與 raise 的位置三者一致 | B、C 包第一次 raise 它們的 PR |
| 3 | 雷達契約（模組地圖上目前寫「待定」）：dimensions［name、low_pole、high_pole、source］＋每位學生每維的分數＋引用 | B 包做雷達之前先定，前端接這一份 |
| 4 | 統整引用的對外型別：points［text、sources［message_id、quote、起訖位置］］，統整、最終統整、雷達三處共用。LLM 端的 `message_ref` 由 C 包在驗證時換成 `message_id`；起訖位置的單位（字元或 UTF-16）由你在契約裡寫明 | C 包定 schema 時一起 |
| 5 | TTS 契約（文字→音訊＋字時間點） | C 包做語音時 |
| 6 | 更新 `docs/modules/README.md` 的「契約」表：刪掉舊單人對話（solo-dialogue）那一列，新增課程、單人活動、雷達、TTS 四列 | 每一項落地時同步更新 |

## 和其他包的接縫
- 你不寫業務邏輯。B、C 包寫端點，你確認契約完整、型別重產後沒有 diff。
- 前端缺欄位時，前端會寄契約請求給該端點所屬模組的負責人，你負責把請求轉到正確的包。

## 規則（沿用 repo 現行檢查）
- 回應一律要有 response_model。新增端點時同時更新 `app/modules/contract/contracts.py` 並重產型別（`python scripts/gen_classroom_types.py`），重產後不能有 diff。
- 改到別包的檔案時，照該檔所屬的模組分開送 PR，由那一包的負責人審。

## 送 PR 前的檢查
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

## 交接完成的定義
- 能在本機跑起後端，並通過上面全部的檢查。
- 讀完契約相關文件與 NEW-FEATURES 第 4 節，列出自己的第一個 PR，並在團隊 Discord 認領。

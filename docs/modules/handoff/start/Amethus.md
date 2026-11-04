# 交接包：Amethus（D 包：對接）

分支：`backend/Amethus/main`｜PR 目標：`backend/main`｜交接文件：[D-contract.md](../D-contract.md)

## 第一天
1. 讀 [README.md](../README.md) 的「第一次拿到這份文件」，把專案跑起來，並確認測試全綠。
2. 讀你這包的交接文件：[D-contract.md](../D-contract.md)。
3. 讀 `docs/classroom/NEW-FEATURES.md` 第 4 節（API 關係）。
4. 在團隊 Discord 回報你的第一個 PR 要做什麼。

## 你的第一個 PR
在 `backend/app/modules/contract/` 建立「新端點檢查表」。之後 B、C 包每開一個新端點，你審三件事：response_model、reason code、型別重產後沒有 diff。

`GUEST_JOIN_DISABLED`、`GUEST_EXPIRED`、`EXPANSION_LOCKED`、`RADAR_NOT_READY` 不預先登記；每個 code 由第一次 raise 它的 B、C 包 PR 同時加入 `REASON_CODES` 與 `frontend/src/contract/errorText.ts`，你負責審目錄、前端文字與 raise 位置三者一致。

## 你這包的工作（細節見 D-contract.md）
- 型別產生器為每個端點產出 request／response 型別；前端 client 依 path＋method 帶型別；錯誤碼產成 TS 型別。
- 和 A、B、C 包一起把 `RESPONSE_MODEL_PENDING` 清到 0。
- 定義雷達契約、統整引用型別、TTS 契約。
- 更新 `docs/modules/README.md` 的契約表。

## 流程
1. 從 `backend/Amethus/main` 開始，這條分支是從 `backend/main` 開出來的。`backend/Amethus/` 底下可以自由開分支（例如 `backend/Amethus/<主題>`），把 `backend/Amethus/main` 當成根。
2. 做完一個功能，就從 `backend/Amethus/` 底下的分支開 PR 到 `backend/main`。Arthur 審完後合進 backend/main，再以功能為單位打包成 PR 給 `develop`。
3. `backend/main` 有新東西時，先 merge 進自己的分支再繼續做。
4. 送 PR 前跑交接文件裡「送 PR 前的檢查」那幾行。

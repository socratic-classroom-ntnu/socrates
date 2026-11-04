# Amethus 的工作清單（D 包：對接）

## 你的第一個 PR
在 `app/modules/contract/` 建立「新端點檢查表」，並在 reason code 目錄加入 `GUEST_JOIN_DISABLED`、`GUEST_EXPIRED`、`EXPANSION_LOCKED`、`RADAR_NOT_READY`，每個都附前端要顯示的文字。

## 全部工作（照順序做；「—」是不綁新功能的現有待辦，有空檔就做）
| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 1 | contract | 全部 | 上面的第一個 PR；之後 Ken、Courecta 每開一個新端點，你審 response_model、reason code、重產型別後沒有 diff 三件事 | — | 檢查表合進 `backend/main` |
| 2 | contract | 免註冊加入、敘述型活動 | 4 個新 reason code 與前端顯示文字的對照 | Courecta 的訪客帳號、Ken 的敘述活動 PR | 每個 reason code 都有對照 |
| 3 | contract | 雷達圖 | 雷達契約：dimensions［name、low_pole、high_pole、source＝embedding｜llm］＋每位學生每維的分數＋引用 | Ken 做雷達之前先定 | 前端只接這一份 |
| 4 | contract | 統整引用 | 引用型別：points［text、sources［message_id、quote、起訖位置］］，統整、最終統整、雷達三處共用 | 和 Courecta 定 schema 時一起 | 三處用同一個型別 |
| 5 | contract | 語音 | TTS 契約（文字→音訊＋字時間點） | Courecta 做語音時 | 前端 media 能接 |
| 6 | contract | 全部 | 更新 `docs/modules/README.md` 的「契約」表：刪掉舊單人對話那一列，新增課程、單人活動、雷達、TTS 四列 | 每一項落地時同步 | 表和程式一致 |
| — | contract | 現有待辦 | 型別產生器為每個端點產出 request／response 型別；前端 client 依 path＋method 帶型別；錯誤碼產成 TS 型別 | — | — |
| — | contract | 現有待辦 | 和 Hsy、Ken、Courecta 一起把 `RESPONSE_MODEL_PENDING` 清到 0（目前約 24 條） | — | 清單變成空的 |

## 注意
- 可寫的檔案：`backend/app/modules/contract/`、前端 `frontend/src/contract/`。不放業務 model。

## 規則（repo 現行檢查會擋）
- 只 import 其他模組的 contracts／service／repositories；route 不互相引用，也不動態 import。`python scripts/check_modules.py` 的違規數只能變少。
- 回應一律要有 response_model。新增端點時同一個 PR 更新 `app/modules/contract/contracts.py`，並重產型別（`python scripts/gen_classroom_types.py`），重產後沒有 diff。
- 一個 PR 只動一個模組。改到別包的檔案時，照檔案所屬的模組分開送 PR，給那一包的負責人審。

## 送 PR 前的檢查
在 repo 根目錄依序跑，全部通過再送：
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

# 新端點契約檢查表

B、C 包新增或修改 `/api/v2` 端點時，端點作者先完成「提交前」檢查，D 包再依「契約審查」複核。業務 schema 與邏輯仍屬端點所在模組；contract 模組只維護跨前後端的契約目錄與產生入口。

## 端點作者：提交前

### Route 與模組邊界

- [ ] Route 放在擁有該業務的模組，沒有為了共用而把業務 model 搬到 `backend/app/modules/contract/`。
- [ ] 跨模組依賴已列在 `docs/modules/modules.json` 的 `uses`；除 `platform` 基礎建設與可依賴全部模組的組裝層外，import 只經過對方的 `contracts.py`、`service.py` 或 `repositories.py`。
- [ ] Route 沒有 import 其他模組的 route，ORM 只出現在 repositories。
- [ ] 狀態機轉換使用 `POST /{resource}/{id}/{action}`，且 action 存在後端的 Literal union 與 `available_actions` 契約；資源 CRUD 才使用 REST 動詞。

### Request 與 response

- [ ] Request body 使用所屬模組的明確 Pydantic schema，沒有以未定型 `dict` 代替公開契約。
- [ ] Route 明確宣告 `response_model`，且 service 的實際回應符合該 model。
- [ ] 唯一例外是 HTTP 204：204 沒有 response body，FastAPI 也不允許為它指定 response model。
- [ ] 新端點沒有加入 `RESPONSE_MODEL_PENDING`；這份清單只能在舊端點補上 `response_model` 時縮短。
- [ ] 學生端回應沒有洩漏只給教師或後端使用的欄位，例如單人活動 flags。

### Reason code

- [ ] 新錯誤使用穩定的大寫 reason code，不把可變文案當成程式判斷依據。
- [ ] Reason code 在第一次實際 `raise DomainError(...)` 的同一個 PR 加入 `backend/app/modules/contract/contracts.py` 的 `REASON_CODES`，不預先登記。
- [ ] `REASON_CODES` 列出的 owner 與實際 raise 它的模組一致。
- [ ] 使用者會看到的 code 同時加入 `frontend/src/contract/errorText.ts`；只有不回傳給應用程式使用者的 code 才列入 `SERVER_ONLY_REASON_CODES`。
- [ ] 只有真的動態來源（例如 provider outcome）才列入 `DYNAMIC_REASON_CODES`，不用它繞過 literal `DomainError` 目錄檢查。

### OpenAPI 與前端型別

- [ ] OpenAPI 的正確 path＋method 已出現 request body 與成功 response schema，而不只有 component schema。
- [ ] 前端 client 仍由 `frontend/src/contract/` 呼叫 API，feature 沒有自己 fetch，也沒有手寫一份重複的 request／response 型別。
- [ ] 若 PR 新增或調整 client wrapper，目前先使用該 OpenAPI operation 對應的 generated DTO；產生器支援 operation types 後，再直接依 path＋method 限制 request／response。
- [ ] `/api/v2` schema 改動已在主機執行 `python scripts/gen_classroom_types.py`；`/api` schema 改動已執行 `./scripts/gen_types.sh`。
- [ ] 預期的 OpenAPI／TypeScript 產物變動已納入 PR；再執行一次產生器後，以 `git diff --exit-code` 確認沒有未提交差異。
- [ ] 沒有手寫 `frontend/classroom-openapi.json`、`frontend/src/contract/classroomTypes.ts`、`frontend/openapi.json` 或 `frontend/src/contract/types.ts`。

### PR 驗證證據

- [ ] 端點的 API 測試覆蓋成功回應、request 驗證與穩定 reason code。
- [ ] `docker compose exec backend python -m pytest tests/contract -q`
- [ ] `python3 scripts/check_modules.py`
- [ ] `bash scripts/check_naming.sh`
- [ ] Schema 有改時，重產後執行 `git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts`。
- [ ] PR 描述列出改了什麼契約、碰到哪些共用點，以及實際執行的驗證命令與結果。

## D 包：契約審查

- [ ] 逐一對照 route 的 method、path、request schema、`response_model` 與 OpenAPI operation。
- [ ] 確認 response model 是業務回應的真實契約，不是為了通過 gate 而使用過寬的 model。
- [ ] 對照每個新 `DomainError` 的 raise 位置、`REASON_CODES` owner 與前端文字；三者一致。
- [ ] 確認 `RESPONSE_MODEL_PENDING` 沒有變長，已補 model 的舊端點已從清單刪除。
- [ ] 檢視 PR 相對 base 的 generated contract diff：只包含這次 API 改動預期影響的 path、operation 與 schema。
- [ ] 在乾淨的 PR head 重產契約，並以 `git diff --exit-code` 確認 generated artifacts 沒有任何工作目錄差異。
- [ ] 確認前端使用 generated types，網路呼叫沒有離開 `frontend/src/contract/`，動作只來自後端 `available_actions`。
- [ ] 檢視作者附上的測試與驗證輸出；證據不完整時不以「編譯成功」當作契約正確的證明。

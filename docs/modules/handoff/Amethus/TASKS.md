# Amethus／D 包任務

權威工作範圍見 [D-contract.md](../D-contract.md)；本檔只記執行順序與完成條件。

## 現在：第一個 PR

- [ ] 在 `backend/app/modules/contract/` 建立「新端點檢查表」。
- [ ] 檢查表要覆蓋 `response_model`、reason code／前端文字、契約型別重產與無 diff。
- [ ] 檢查表要分開端點作者與 D 包審查者的責任。
- [ ] 不預先登記尚未被 raise 的 reason code。
- [ ] 送 PR 前完成 D-contract 列出的檢查。

## 持續審查：B、C 包新端點

每個新增或修改的端點都要確認：

- [ ] Route 明確宣告 `response_model`；204 無回應內容是例外。
- [ ] 新 reason code 在第一次 raise 它的 PR 加入 `REASON_CODES`。
- [ ] `frontend/src/contract/errorText.ts` 有對應的使用者文字，server-only code 除外。
- [ ] Reason code 的 raise 模組、目錄 owner 與前端文字一致。
- [ ] 已重產 OpenAPI 與 TypeScript 型別，再跑一次產生器時沒有 diff。
- [ ] 改動沒有讓 `RESPONSE_MODEL_PENDING` 變長。

四個已知 code 的第一次實作分工：

| Reason code | 第一次 raise 的包 | D 包要審的事 |
|---|---|---|
| `GUEST_JOIN_DISABLED` | B（Ken） | raise 位置、`REASON_CODES`、前端文字 |
| `EXPANSION_LOCKED` | B（Ken） | raise 位置、`REASON_CODES`、前端文字 |
| `RADAR_NOT_READY` | B（Ken） | raise 位置、`REASON_CODES`、前端文字 |
| `GUEST_EXPIRED` | C（Courecta） | raise 位置、`REASON_CODES`、前端文字 |

## 後續實作

### 端點與前端型別

- [ ] 型別產生器為每個 path＋method 產出 request 與 response 型別。
- [ ] 前端 client 依 path＋method 限制 request 與 response。
- [ ] Reason code 目錄產成 TypeScript 型別。

### 現有契約收旂

- [ ] 和 A、B、C 包合作把 `RESPONSE_MODEL_PENDING` 清到 0。
- [ ] 各模組負責定義業務 response model；D 包審契約與產生物。

### 共用契約

- [ ] 在 B 包實作雷達前定義統一雷達契約。
- [ ] 和 C 包定義統整引用對外型別：`message_id`、`quote`、起訖位置，並明訂位置單位。
- [ ] 和 C 包定義 TTS 的文字、音訊與字時間點契約。
- [ ] 各契約落地時同步更新 `docs/modules/README.md` 的契約表。

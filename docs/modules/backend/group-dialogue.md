# Group Dialogue（後端）

## Purpose

分組作答、個人追問、代表討論、觀點確認、final reflection 與 settlement。

## Public contract

- GroupRunView
- personal dialogue projection
- group commands
- settlement and confirmation receipts

## Toy page

本模組使用既有`frontend/src/features/dev-console/`註冊fixture與操作面板。Toy page與production frontend共用generated client、ViewModel與reason codes。

## Acceptance package

- API contract與generated types同步。
- Toy page完成happy path、typed error、permission、retry／idempotency與boundary fixtures。
- Backend module tests與Frontend adapter tests各自通過。
- 審查通過。
- Compatibility ledger同步更新。
- 源頭、呼叫端、generated artifacts與交接文件在同一個commit更新。

## 第一批工作

1. 把 group evidence、personal dialogue、confirmation、settlement、projection 拆成明確 components。
2. 以 explicit composition 取代 extend() 與 class reassignment。
3. 建立 toy page：單一 group run 可完整跑回答、個人追問、確認、settlement。

## Scope rules

- 本模組範圍內的變更經審查後合併。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、identity-access、ai-providers、llm-runtime、content-authoring、classroom-core

檔案範圍：
- `backend/app/modules/group_dialogue/`

契約：
- 分組課（/groups/*）（產生型別 ✅）
- AI 學生（/ai-students/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

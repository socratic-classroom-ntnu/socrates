# Classroom Core（後端）

## Purpose

教室、成員、題目執行、phase、command、event 與 ViewModel 的生命週期。

## Public contract

- Room/Classroom ViewModel
- available_actions
- unavailable_actions / reason codes
- phase/event projection

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

1. 把 HTTP DTO 與 domain/application contract 分開。
2. 把 GameOrchestrator composition 收斂成明確 constructor 與 ports。
3. 建立 DevConsole toy flow：建立教室、進入 phase、送 command、讀 event。

## Scope rules

- 本模組範圍內的變更經審查後合併。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：platform、identity-access、ai-providers、llm-runtime、content-authoring

檔案範圍：
- `backend/app/orchestrator/classroom_policy.py`
- `backend/app/api/classroom_schemas.py`
- `backend/app/domain/presence.py`
- `backend/app/modules/classroom_core/`

契約：
- 教室房間（/classrooms/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- classroom_schemas.py 是所有模組共用的契約檔（約 400 行）：依模組拆成各自的 schemas，改欄位時才不會跨 owner。
- routes/classroom.py 內的 /auth/* 端點移到 Identity & Access。
- routes/classroom.py 底部掛其他模組 router 的部分移到 app-shell。
<!-- module-map:end -->

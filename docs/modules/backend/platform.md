# Platform（後端）

## Purpose

PostgreSQL、realtime、HTTP composition、environment、migration、deployment 與外部 provider adapter。

## Public contract

- repository ports
- event envelope
- readiness/release
- generated API clients
- deployment metadata

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

1. generated client freshness成為CI contract。
2. toy page registry由DevConsole承接，所有domain module可註冊fixture。
3. composition root只做注入與啟動，不承載domain規則。

## Scope rules

- 本模組範圍內的變更經審查後合併。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：後端開發團隊
- 可依賴的模組：不依賴其他模組

檔案範圍：
- `backend/app/repositories/classroom_storage.py`
- `backend/app/realtime.py`
- `backend/app/db.py`
- `backend/app/config.py`
- `backend/app/classroom_env.py`
- `backend/app/feature_flags.py`
- `backend/app/api/model_base.py`
- `backend/app/modules/platform/`

契約：
- 公開設定（/public-config）（✅）
- 人像模型清單（/avatar-packs/catalog.json）（✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 加 import-linter 或同等 CI gate，強制 violations.json 只能變短。
- repositories/classroom_storage.py 為了建表 import routes（classroom_library、provider_profiles、question_bank）：ORM 歸位後刪掉這段。
- 相容帳冊（COMPATIBILITY-LEDGER.md）的舊環境變數別名。
<!-- module-map:end -->

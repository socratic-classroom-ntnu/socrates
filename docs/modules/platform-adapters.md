# Platform Adapters

## Purpose

PostgreSQL、realtime、HTTP composition、environment、migration、deployment 與外部 provider adapter。

## Ownership

| Role | Seat |
|---|---|
| Backend default owner | `Portal-Goose` |
| Frontend default implementation owner | `Portal-Heron` |
| Visual owner | `Design-Goose` |
| Partitioning／acceptance PO | `PO-Goose` |

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

後端（default owner：Portal-Goose）：
- `backend/app/repositories/classroom_storage.py`
- `backend/app/realtime.py`
- `backend/app/db.py`
- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/classroom_app.py`
- `backend/app/classroom_server.py`
- `backend/app/classroom_env.py`
- `backend/app/feature_flags.py`
- `backend/app/api/deps.py`
- `backend/app/api/model_base.py`
- `backend/app/api/routes/public_config.py`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/api/`
- `frontend/src/features/dev-console/`
- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/testkit.ts`
- `frontend/src/setupTests.ts`
- `frontend/src/types/window-globals.d.ts`

## 待清項（源頭修正，做完從這裡刪掉）

- repositories/classroom_storage.py 為了建表 import routes（classroom_library、provider_profiles、question_bank）：ORM 歸位後刪掉這段。
- 加 import-linter：route 不被 service／repository import、ORM 只在 repositories、import cycle＝0；前端 eslint 禁 features import pages。
- DevConsole 底下開 toy page 註冊點：每個後端模組一頁，直接呼叫 API、顯示原始回應與 available_actions。
- 相容帳冊（COMPATIBILITY-LEDGER.md）的舊環境變數別名。
<!-- module-map:end -->

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
- Default owner review receipt成立。
- Compatibility ledger同步更新。
- Source、caller、generated artifacts與handoff文件形成同一successor。

## First metabolism

1. generated client freshness成為CI contract。
2. toy page registry由DevConsole承接，所有domain module可註冊fixture。
3. composition root只做注入與啟動，不承載domain規則。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

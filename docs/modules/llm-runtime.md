# LLM Runtime

## Purpose

Provider profiles、routing、budget、jobs、iron rules、structured output 與 call audit。

## Ownership

| Role | Seat |
|---|---|
| Backend default owner | `Portal-Goose` |
| Frontend default implementation owner | `Portal-Heron` |
| Visual owner | `Design-Goose` |
| Partitioning／acceptance PO | `PO-Goose` |

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ❌）

後端（default owner：Portal-Goose）：
- `backend/app/tutor/`
- `backend/app/services/llm_workers.py`
- `backend/app/services/scenario_ai.py`
- `backend/app/api/routes/provider_profiles.py`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/pages/ProviderSettings.tsx`
- `frontend/src/features/ai-settings/`

## 待清項（源頭修正，做完從這裡刪掉）

- routes/provider_profiles.py 954 行：ORM（ProviderProfile、SessionProviderSecret、AccountAISettings）、金鑰加解密、provider 路由鏈、呼叫稽核全在 route 檔。拆成 repositories（ORM）＋services/providers（加解密、路由鏈、稽核）＋route（只有 HTTP）。
- services/llm_workers.py、services/scenario_ai.py import routes/provider_profiles：拆完改引用 service。
- prompts.compile_program 的 key 算兩次（第一次被覆蓋）。
- 鐵則：安全類訊息改固定關心句＋老師看得到的安全 flag（與偏題隱藏 flag 分欄）；第 5 條個資措辭（subPO-Heron 65869a6b0156、Arthur WB c30f-G1＝A）。
- frontend ProviderSettings 還在 pages 底下，被 ai-settings、script-builder 反向引用：移進 features/ai-settings。
<!-- module-map:end -->

## Public contract

- ProviderProfileView
- model discovery
- LLM job intent/result
- audit projection and stable reason codes

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

1. API route 經 application use case 呼叫 tutor port。
2. 拆 profile CRUD、secret storage、routing resolution、connection discovery、audit。
3. 建立 toy page：profile 測試、route resolve、budget、typed error、audit readback。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

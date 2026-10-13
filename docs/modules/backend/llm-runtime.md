# LLM Runtime（後端）

## Purpose

Provider profiles、routing、budget、jobs、iron rules、structured output 與 call audit。

## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：後端；default owner：Portal-Goose
- 可依賴的模組：platform、ai-providers

檔案範圍：
- `backend/app/tutor/`
- `backend/app/services/llm_workers.py`
- `backend/app/services/scenario_ai.py`
- `backend/app/domain/tutor.py`

契約：
- TTS（文字→音訊＋字時間點）（等契約（已寄 Portal-Goose））

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `llm-runtime→classroom-core  backend/app/services/llm_workers.py → backend/app/api/classroom_schemas.py`
- `llm-runtime→classroom-core  backend/app/services/llm_workers.py → backend/app/orchestrator/classroom.py`
- `llm-runtime→classroom-core  backend/app/services/llm_workers.py → backend/app/services/classroom.py`
- `llm-runtime→classroom-core  backend/app/services/scenario_ai.py → backend/app/orchestrator/classroom.py`
- `llm-runtime→classroom-core  backend/app/tutor/classroom_gateway.py → backend/app/orchestrator/classroom.py`
- `llm-runtime→classroom-core  backend/app/tutor/prompts.py → backend/app/api/classroom_schemas.py`
- `llm-runtime→content-authoring  backend/app/tutor/gateway.py → backend/app/domain/ladder.py`
- `llm-runtime→group-dialogue  backend/app/services/llm_workers.py → backend/app/services/ai_students.py`
- `llm-runtime→identity-access  backend/app/services/llm_workers.py → backend/app/services/email_delivery.py`
- `llm-runtime→round1  backend/app/domain/tutor.py → backend/app/domain/types.py`

## 待清項（源頭修正，做完從這裡刪掉）

- services/llm_workers.py、services/scenario_ai.py import routes/provider_profiles：拆完改引用 service。
- prompts.compile_program 的 key 算兩次（第一次被覆蓋）。
- 鐵則：安全類訊息改固定關心句＋老師看得到的安全 flag（與偏題隱藏 flag 分欄）；第 5 條個資措辭（subPO-Heron 65869a6b0156、Arthur WB c30f-G1＝A）。
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
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 架構與審查：Portal-Heron；執行：Portal-Goose
- 可依賴的模組：platform、ai-providers

檔案範圍：
- `backend/app/tutor/`
- `backend/app/services/llm_workers.py`
- `backend/app/services/scenario_ai.py`
- `backend/app/domain/tutor.py`

契約：
- TTS（文字→音訊＋字時間點）（等契約（已寄 Portal-Goose））

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `llm-runtime→classroom-core  backend/app/services/llm_workers.py → backend/app/api/classroom_schemas.py`
- `llm-runtime→classroom-core  backend/app/services/llm_workers.py → backend/app/orchestrator/classroom.py`
- `llm-runtime→classroom-core  backend/app/services/llm_workers.py → backend/app/services/classroom.py`
- `llm-runtime→classroom-core  backend/app/services/scenario_ai.py → backend/app/orchestrator/classroom.py`
- `llm-runtime→classroom-core  backend/app/tutor/classroom_gateway.py → backend/app/orchestrator/classroom.py`
- `llm-runtime→classroom-core  backend/app/tutor/prompts.py → backend/app/api/classroom_schemas.py`
- `llm-runtime→content-authoring  backend/app/tutor/gateway.py → backend/app/domain/ladder.py`
- `llm-runtime→group-dialogue  backend/app/services/llm_workers.py → backend/app/services/ai_students.py`
- `llm-runtime→identity-access  backend/app/services/llm_workers.py → backend/app/services/email_delivery.py`
- `llm-runtime→solo-dialogue  backend/app/domain/tutor.py → backend/app/domain/types.py`

## 待清項（源頭修正，做完從這裡刪掉）

- services/llm_workers.py、services/scenario_ai.py import routes/provider_profiles：拆完改引用 service。
- prompts.compile_program 的 key 算兩次（第一次被覆蓋）。
- 鐵則：安全類訊息改固定關心句＋老師看得到的安全 flag（與偏題隱藏 flag 分欄）；第 5 條個資措辭（subPO-Heron 65869a6b0156、Arthur WB c30f-G1＝A）。
<!-- module-map:end -->

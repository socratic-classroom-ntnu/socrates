# Analytics

## Purpose

立場分布、雷達圖、教師紀錄、摘要與可追溯分析 projection。

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
- `backend/app/domain/group_analysis.py`

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/features/group-analytics/`
- `frontend/src/features/teacher-records/`

## 待清項（源頭修正，做完從這裡刪掉）

- teacher-records 的型別手寫（等 Group Dialogue 的分組 view response_model）。
- group-analytics 引用 personal-dialogue 的元件：共用部分抽到 shared。
- 雷達圖（Design-Goose 六畫面表 1fba59189afd）在這個模組。
<!-- module-map:end -->

## Public contract

- stance distribution
- radar axes and source provenance
- teacher records
- group analysis projection（雷達圖、立場分布）；Round 1 的 history、summary 屬 Classroom Lifecycle

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

1. 定義 machine-readable axes、分母、來源與版本。
2. toy page 可切換班級／組別／個人 fixture 並驗證雷達輸入。
3. 分析只讀 projection 與課堂 mutation 分開。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。

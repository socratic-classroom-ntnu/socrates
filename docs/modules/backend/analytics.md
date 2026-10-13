# Analytics（後端）

## Purpose

立場分布、雷達圖、教師紀錄、摘要與可追溯分析 projection。

## Public contract

- stance distribution
- radar axes and source provenance
- teacher records
- group analysis projection（雷達圖、立場分布）；單人對話的 history、summary 屬 solo-dialogue

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

1. 定義 machine-readable axes、分母、來源與版本。
2. toy page 可切換班級／組別／個人 fixture 並驗證雷達輸入。
3. 分析只讀 projection 與課堂 mutation 分開。

## Scope rules

- 本模組範圍內的變更經審查後合併。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、classroom-core、group-dialogue

檔案範圍：
- `backend/app/domain/group_analysis.py`

契約：
- 雷達圖（等契約（設計稿））

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 雷達圖契約（依設計稿的教師分析六畫面）。
<!-- module-map:end -->

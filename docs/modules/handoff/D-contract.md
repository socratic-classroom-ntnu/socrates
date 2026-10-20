# D 包：對接

模組：contract（後端，約 224 行 Python）

## 起點
- 分支：develop（Arthur 10/20 決定：backend/arthur/dev 的整合內容先進 develop，認領人再從 develop 開自己的分支）。
- 自己的分支命名照 AGENTS.md 的分支表；PR 一個模組一個，送出前先跑下方檢查。
- 先讀：本包每個模組的 `docs/modules/backend/<模組>.md`、`docs/modules/README.md`（總表）、`docs/classroom/STATE-MACHINE.md`、`docs/classroom/LLM-OUTPUT-SCHEMA.md`。

## 範圍
### Contract（對接）（`contract`）
- 做什麼：收集各模組的契約：兩份 OpenAPI 的產生入口、reason code 目錄、尚未帶 response_model 的端點清單（只能變短）。不放業務 model。
- 可寫的檔案：`backend/app/modules/contract/`
- 依賴的其他包：全部模組（組裝層）
- 模組文件：[docs/modules/backend/contract.md](../backend/contract.md)
- 接手時的待辦：
  - 無

## 規則（沿用 repo 現行檢查）
- 只 import 其他模組的 contracts／service／repositories；route 不互引、不動態 import（`python scripts/check_modules.py`，違規數只能變少）。
- 回應一律有 response_model；新增端點同時更新 `app/modules/contract/contracts.py` 並重產型別（`python scripts/gen_classroom_types.py`），重產後無 diff。
- 改到別包的檔案：照該檔所屬模組分開送 PR，由那一包的負責人審。

## 送 PR 前的檢查
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```

## 交接完成的定義
- 負責人能在本機跑起後端與上面全部檢查。
- 負責人讀完本包模組文件，列出自己要先做的第一件事，並在團隊 Discord 認領。

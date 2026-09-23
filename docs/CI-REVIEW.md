# CI 逐項檢視與改版 — Run2

來源：stage@55c9c942e935abd60dd2f93a293b0904580a26c9 的 ci.yml、stage-release.yml、stage-deploy.yml。
授權：Arthur 本輪要求先發布來源再啟動CI，逐一檢視並可重寫。

| 既有項目 | 本輪處置 | 責任與實際release條件 |
|---|---|---|
| checkout／Python／Node／cache | 保留，Node22/Python3.12 | 對齊repo既有版本 |
| Backend Ruff lint | 保留 | 全backend source；候選組裝先作Ruff修整 |
| Backend Ruff format | 保留 | 包含歷史conversation.py/history.py與新Run2 |
| Backend mypy | 分層執行 | 舊核心strict；Run2 adapter設定單獨、check_untyped_defs |
| Backend pytest | 保留＋Run2 | 真PG執行API/DB，SQLite僅compiler測試adapter |
| Frontend npm lock | 遷移收斂 | Loom嘗試產lock；首CI可產lock並artifact，Release消費同lock |
| Frontend lint | 保留 | React source |
| Frontend typecheck | 保留 | 真tsc，包含generated Run2 DTO |
| Frontend Vitest | 遷移Jest/SWC | 保留測試assertions，補scrollIntoView測試adapter |
| Frontend build | Rsbuild | 真production build，avatar來源Git blob固定 |
| OpenAPI contract | 保留v1＋新增v2 | 每個generator從實際API建立，再以git diff比對 |
| Round1 E2E | 保留 | health正向確認、原journey、always logs與compose cleanup |
| Run2 2×60 workload | 本輪核定 | 兩worker、PG、122 WS、120 concurrent answers、冪等與reconnect |
| ci-required | 擴展ALL-OF | 上述5条主要jobs全部success才釋放Release |
| Stage Release | 改workflow_call | 由同revision CI呼叫；綁exact SHA／lock／digests |
| Stage Deploy | 改workflow_call | 消費digest；專用runner顯式admitted後啟用；部署併發採序列化 |

## 本次先發布後CI

source commit含 `[skip ci]`→三條canonical refs回讀→相同tree的empty activation commit→CI。
Activation另有SHA，兩者source tree相同。後續普通stage push使用現有CI觸發。
`main`保留原有來源；reusable workflow由caller同revision讀取。

## 證據層次

SOURCE_PUBLISHED、CI_ACCEPTED、RELEASE_PUBLISHED、PUBLIC_ADOPTED各自保存。
Compiler的schema、SQLite unit/API tests、TS語法轉譯與PG／Node／瀏覽器實測分開。
CI schema job會實際生成contract；欄位差異由log指出，再沿exact SHA修正。

## Runtime能力邊界

本次compiler環境的npm／codeload網路attempt回報DNS解析限制。Python已使用實際installed依賴執行28項tests。
Run2 multiworker/PG workload、完整Node install/tsc/Jest/Rsbuild、live model與SMTP採用由host／CI／operator receipts回報。

## V74 合併增補
原有Backend formatter與前端scroll adapter保留；新增shared Composer測試涵蓋mic/Enter layout、partial/final、IME、送出冪等。
Local與GitHub publication採獨立source checkout；Local readiness與Portal owner採用各自接受。
TypeScript語法轉譯與SQLite tests是compiler驗證，完整應用與PostgreSQL能力由CI結果決定。

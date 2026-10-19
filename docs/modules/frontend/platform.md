# Platform（前端）

呼叫後端的唯一出口（api/：產生的型別、client、錯誤文字）、共用 UI、開發控制台與 toy page。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：前端；default owner：前端開發團隊；視覺：視覺設計團隊
- 可依賴的模組：contract
- Figma：Figma:Project/Socratic.Socratic · Frontend.08 Platform Adapters.模組卡

檔案範圍：
- `frontend/src/components/`
- `frontend/src/shared/phaseLabels.ts`
- `frontend/src/shared/personalStatus.ts`
- `frontend/src/features/dev-console/`
- `frontend/src/testkit.ts`
- `frontend/src/setupTests.ts`
- `frontend/src/types/window-globals.d.ts`
- `frontend/src/vite-env.d.ts`

契約：
- 公開設定（/public-config）（✅）
- 人像模型清單（/avatar-packs/catalog.json）（✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- DevConsole 底下開 toy page 註冊點：每個後端模組一頁，直接呼叫 API、顯示原始回應與 available_actions。
<!-- module-map:end -->

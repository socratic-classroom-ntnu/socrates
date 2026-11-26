# 後台（前端）

平台管理員的後台：功能開關、意見回饋列表與詳情、管理員增減（只做電腦版，非管理員一律找不到頁面）。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：前端；default owner：前端開發團隊；視覺：視覺設計團隊
- 可依賴的模組：platform、contract、auth、feedback

檔案範圍：
- `frontend/src/features/admin/`

契約：
- 後台（/admin）（產生型別 ✅）
- 通知（/notifications、/admin/announcements）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

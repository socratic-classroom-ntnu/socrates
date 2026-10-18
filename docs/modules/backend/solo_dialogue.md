# Solo Dialogue（後端）

單人對話：學生與導師一對一走完階梯，含逐字稿、歷史紀錄與總結。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 架構與審查：Arthur；執行：Arthur
- 可依賴的模組：platform、llm_runtime、content_authoring

檔案範圍：
- `backend/app/modules/solo_dialogue/`

契約：
- 單人對話 OpenAPI → 前端型別（產生）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- `orm-outside-repositories  backend/app/modules/solo_dialogue/interaction_models.py`
- `orm-outside-repositories  backend/app/modules/solo_dialogue/models.py`
- `solo_dialogue→app_shell  backend/app/modules/solo_dialogue/api/deps.py → backend/app/main.py`
- `solo_dialogue→app_shell  backend/app/modules/solo_dialogue/api/routes/history.py → backend/app/main.py`

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

# Group Dialogue（前端）

分組課堂、個人追問、分組舞台。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ⚠️）

- 端：前端；default owner：前端開發團隊；視覺：視覺設計團隊
- 可依賴的模組：platform、media、ai-settings、teacher-analytics、contract
- Figma：Figma:Project/Socratic.Socratic · Frontend.02 Group Dialogue.模組卡

檔案範圍：
- `frontend/src/features/group-dialogue/`
- `frontend/src/features/personal-dialogue/`
- `frontend/src/features/classroom-stage/`

契約：
- 分組課（/groups/*）（產生型別 ✅）
- AI 學生（/ai-students/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 後端 GroupClassroomView 已生成；前端元件的顯式型別採用由前端 owner 接續。
- GroupClassroom.tsx 裡的流程邏輯：契約採用後只留畫面與接線。
<!-- module-map:end -->

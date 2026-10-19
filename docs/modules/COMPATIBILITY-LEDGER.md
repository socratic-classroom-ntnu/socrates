# Compatibility Ledger

| Entry | Owner | Current source | Replacement | Remove condition | Checkpoint | Tests |
|---|---|---|---|---|---|---|
| pre-rename environment aliases | Arthur | `backend/app/modules/platform/env.py` | canonical `CLASSROOM_*` variables | deployment與fixtures全數使用canonical名稱 | Platform Adapters acceptance | env parsing＋deployment smoke |
| legacy app composition | Arthur | `backend/app/classroom_server.py`／`classroom_app.py` | explicit composition roots | 單人對話與Classroom routes各有獨立composition與contract tests | Classroom Lifecycle acceptance | readiness＋route inventory |
| legacy group frontend adapter | 前端組員 | `frontend/src/pages/GroupClassroom.tsx`／`ClassroomApp.tsx` | module view adapters | GroupRun各phase使用generated ViewModel與專屬view adapter | Group Dialogue acceptance | Jest＋toy page fixtures |
| provider legacy key | Arthur | `backend/app/modules/ai_providers/routes.py` | versioned secret-store adapter | existing encrypted rows完成read／rewrite驗收 | LLM Runtime acceptance | migration fixture＋decrypt readback |

每筆compatibility在達成remove condition後，以覆蓋式更新移除source、caller、tests與文件中的舊路徑；History保存原lineage。

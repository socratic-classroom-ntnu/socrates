# Compatibility Ledger

| Entry | Owner | Current source | Replacement | Remove condition | Checkpoint | Tests |
|---|---|---|---|---|---|---|
| pre-rename environment aliases | Portal-Goose | `backend/app/classroom_env.py` | canonical `CLASSROOM_*` variables | deployment與fixtures全數使用canonical名稱 | C15 Platform Adapters acceptance | env parsing＋deployment smoke |
| legacy app composition | Portal-Goose | `backend/app/classroom_server.py`／`classroom_app.py` | explicit composition roots | Round 1與Classroom routes各有獨立composition與contract tests | C15 Classroom Lifecycle acceptance | readiness＋route inventory |
| legacy group frontend adapter | Portal-Heron | `frontend/src/pages/GroupClassroom.tsx`／`ClassroomApp.tsx` | module view adapters | GroupRun各phase使用generated ViewModel與專屬view adapter | C15 Group Dialogue acceptance | Jest＋toy page fixtures |
| provider legacy key | Portal-Goose | `backend/app/api/routes/provider_profiles.py` | versioned secret-store adapter | existing encrypted rows完成read／rewrite驗收 | C15 LLM Runtime acceptance | migration fixture＋decrypt readback |
| stable legacy UUID namespaces | Portal-Goose | `backend/app/api/routes/ai_students.py` | versioned identity registry | existing rows與new rows各有明確namespace version | C15 Group Dialogue acceptance | deterministic identity fixtures |

每筆compatibility在達成remove condition後，以覆蓋式更新移除source、caller、tests與文件中的舊路徑；History保存原lineage。

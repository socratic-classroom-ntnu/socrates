# Backend branch topology

```text
master
develop
backend/arthur
backend/integration
stage
```

- `develop` 保留團隊整合線與既有協作者提交。
- `backend/arthur` 承載 Arthur 的後端／Run2 工作。
- `backend/integration` 合併 `develop` 與 Arthur 工作後再推進 `stage`。
- `develope/*` 僅保留於 lineage receipt，完成配對後收攏。

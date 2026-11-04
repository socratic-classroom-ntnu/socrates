# 模組交接模板

```yaml
module:
default_owner:
change_owner:
reviewer:
visual_owner:
acceptance_owner:
purpose:
writable_files: []
review_required_files: []
public_contract: []
input_output: []
dependency_ports: []
handoff_document:
toy_page:
test_commands: []
acceptance_cases: []
migration:
compatibility:
  owner:
  replacement:
  remove_condition:
  checkpoint:
  tests: []
rollback:
done_definition: []
```

## 審查節奏

- 每個交接在同一個工作週期內完成審查。
- 跨模組 diff 依 module path 分開審查。
- 前後端分歧由 Arthur 與前端組員討論決定。

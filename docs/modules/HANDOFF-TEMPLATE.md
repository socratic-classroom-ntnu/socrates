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

## Review節奏

- Default owner在一個Circuit內完成review。
- Circuit結束時由劃分PO代審並留下receipt。
- 跨模組diff依module path分派給各owner。
- 分歧透過Thread交Arthur裁定。

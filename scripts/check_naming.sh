#!/usr/bin/env bash
# 命名清理完成度檢查（docs/superpowers/plans/2026-10-03-dissolve-run2-into-round1-layers.md）
# 只看已追蹤檔案，所以 gitignore 的計畫檔不會干擾。本檔自己的路徑與內容不列入。
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
self="scripts/check_naming.sh"
# 刻意保留：帶版本號的 release 格式識別字與 artifact 名稱（見計畫〈刻意不做〉第 7 條）。
allowed='socrates/run2-release/v1|socrates-run2-release-'

# 只拿掉合法字串本身，再看同一行剩下的部分。整行排除會連同一行裡的違規名稱一起放過。
violations() { sed -E "s#($allowed)##g" | grep -iE 'run2|portal_'; }

if [ "${1:-}" = "--self-test" ]; then
  got=$(printf '%s\n' \
    "a.yml:1:schema: socrates/run2-release/v1" \
    "a.yml:2:schema: socrates/run2-release/v1; portal_group" \
    "a.yml:3:name: socrates-run2-release-abc" \
    "a.yml:4:job: run2-load" | violations | cut -d: -f1-2 | tr '\n' ' ')
  if [ "$got" = "a.yml:2 a.yml:4 " ]; then echo "✓ self-test"; exit 0; fi
  echo "✗ self-test: expected [a.yml:2 a.yml:4 ] got [$got]"; exit 1
fi

fail=0

paths=$(git ls-files | grep -v "^$self\$" | grep -iE 'run2|portal_' || true)
if [ -n "$paths" ]; then
  echo "✗ 路徑含 run2 或 portal_（$(echo "$paths" | wc -l | tr -d ' ') 個）:"; echo "$paths" | sed 's/^/    /'; fail=1
fi

content=$(git grep -In -iE 'run2|portal_' -- . ":!$self" | violations || true)
if [ -n "$content" ]; then
  echo "✗ 內容提及 run2 或 portal_（$(echo "$content" | cut -d: -f1 | sort -u | wc -l | tr -d ' ') 個檔案、$(echo "$content" | wc -l | tr -d ' ') 處）:"; echo "$content" | sed 's/^/    /'; fail=1
fi

[ "$fail" -eq 0 ] && echo "✓ run2 與 portal_ 已從已追蹤檔案中消失"
exit "$fail"

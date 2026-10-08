#!/usr/bin/env bash
# 命名清理完成度檢查（docs/superpowers/plans/2026-10-03-dissolve-run2-into-round1-layers.md）
# 只看已追蹤檔案，所以 gitignore 的計畫檔不會干擾。本檔自己的路徑與內容不列入。
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
self="scripts/check_naming.sh"
# 刻意保留：帶版本號的 release 格式識別字與 artifact 名稱（見計畫〈刻意不做〉第 7 條）。
allowed='socrates/run2-release/v1|socrates-run2-release-'

# 只在特定檔案放行的字串（檔案:字串正則）。舊名 fallback 移除時，刪掉對應的列。
file_allowed='
backend/app/classroom_env.py:RUN2_|PORTAL_AI_
backend/tests/classroom/test_env_fallback.py:RUN2_|PORTAL_AI_
deploy/stage/compose.yml:RUN2_
deploy/local/compose.yml:RUN2_
deploy/stage/.env.example:RUN2_
docs/CLASSROOM-ARCHITECTURE.md:RUN2_|PORTAL_AI_
AGENTS.md:backend/app/run2/|frontend/src/run2/
'
# 有日期的歷史紀錄：本文照原樣保留，不改寫也不檢查（開頭的現行文件連結另外維護）。
records=":!docs/CI-REVIEW.md :!docs/development/backend-branches.md"

# 只拿掉合法字串本身，再看同一行剩下的部分。整行排除會連同一行裡的違規名稱一起放過。
violations() {
  script="s#($allowed)##g"
  while IFS=: read -r f tok; do
    [ -n "$f" ] || continue
    script="$script
\\#^$(printf '%s' "$f" | sed 's/[.]/\\./g'):#s#($tok)##g"
  done <<EOF_ALLOWED
$file_allowed
EOF_ALLOWED
  sed -E "$script" | grep -iE 'run2|portal_'
}

if [ "${1:-}" = "--self-test" ]; then
  got=$(printf '%s\n' \
    "a.yml:1:schema: socrates/run2-release/v1" \
    "a.yml:2:schema: socrates/run2-release/v1; portal_group" \
    "a.yml:3:name: socrates-run2-release-abc" \
    "a.yml:4:job: run2-load" \
    "deploy/stage/compose.yml:18:      X: \${RUN2_A:-1}" \
    "backend/app/x.py:1:os.environ['RUN2_A']" \
    "AGENTS.md:9:old home was backend/app/run2/ and app.run2.storage" | violations | cut -d: -f1-2 | tr '\n' ' ')
  want="a.yml:2 a.yml:4 backend/app/x.py:1 AGENTS.md:9 "
  if [ "$got" = "$want" ]; then echo "✓ self-test"; exit 0; fi
  echo "✗ self-test: expected [$want] got [$got]"; exit 1
fi

fail=0

paths=$(git ls-files | grep -v "^$self\$" | grep -iE 'run2|portal_' || true)
if [ -n "$paths" ]; then
  echo "✗ 路徑含 run2 或 portal_（$(echo "$paths" | wc -l | tr -d ' ') 個）:"; echo "$paths" | sed 's/^/    /'; fail=1
fi

# shellcheck disable=SC2086  # records 是刻意以空白分隔的多個 pathspec
content=$(git grep -In -iE 'run2|portal_' -- . ":!$self" $records | violations || true)
if [ -n "$content" ]; then
  echo "✗ 內容提及 run2 或 portal_（$(echo "$content" | cut -d: -f1 | sort -u | wc -l | tr -d ' ') 個檔案、$(echo "$content" | wc -l | tr -d ' ') 處）:"; echo "$content" | sed 's/^/    /'; fail=1
fi

[ "$fail" -eq 0 ] && echo "✓ run2 與 portal_ 已從已追蹤檔案中消失"
exit "$fail"

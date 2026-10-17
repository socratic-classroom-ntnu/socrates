#!/usr/bin/env bash
# 命名檢查：規則見 AGENTS.md〈明文禁止〉的命名兩條。只看已追蹤檔案；本檔自己的路徑與內容不列入。
# 四項：① run2／Run 2／portal_ 舊名 ② Round 1／round1 舊代號（前端由前端組員改名，先不檢查 frontend/）
#       ③ 開發回合編號（r70-、g12_、r70:） ④ 開發工具的內部名稱
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
self="scripts/check_naming.sh"
# 刻意保留：帶版本號的 release 格式識別字與 artifact 名稱。
allowed='socrates/run2-release/v1|socrates-run2-release-'

# 只在特定檔案放行的字串（檔案:字串正則）。舊名 fallback 移除時，刪掉對應的列。
file_allowed='
backend/app/classroom_env.py:RUN2_|PORTAL_AI_
backend/tests/classroom/test_env_fallback.py:RUN2_|PORTAL_AI_
deploy/stage/compose.yml:RUN2_
deploy/local/compose.yml:RUN2_
deploy/stage/.env.example:RUN2_
docs/CLASSROOM-ARCHITECTURE.md:RUN2_|PORTAL_AI_
AGENTS.md:backend/app/run2/|frontend/src/run2/|`run2`、`Run 2`、`Round 1`、`round1`
'
# 前端組員負責的名稱，文件引用時照原樣寫；前端改名後刪掉對應的字串。
frontend_names='/round1|Round1App'
# 有日期的歷史紀錄：本文照原樣保留，不改寫也不檢查。
records=":!docs/CI-REVIEW.md :!docs/development/backend-branches.md"

# 只拿掉合法字串本身，再看同一行剩下的部分。整行排除會連同一行裡的違規名稱一起放過。
strip_allowed() {
  script="s#($allowed|$frontend_names)##g"
  while IFS=: read -r f tok; do
    [ -n "$f" ] || continue
    script="$script
\\#^$(printf '%s' "$f" | sed 's/[.]/\\./g'):#s#($tok)##g"
  done <<EOF_ALLOWED
$file_allowed
EOF_ALLOWED
  sed -E "$script"
}
legacy='[Rr][Uu][Nn]2|Run 2|[Pp][Oo][Rr][Tt][Aa][Ll]_'
round_name='[Rr]ound ?[12]([^0-9]|$)'
violations() { strip_allowed | grep -E "$legacy|$round_name"; }

if [ "${1:-}" = "--self-test" ]; then
  got=$(printf '%s\n' \
    "a.yml:1:schema: socrates/run2-release/v1" \
    "a.yml:2:schema: socrates/run2-release/v1; portal_group" \
    "a.yml:3:name: socrates-run2-release-abc" \
    "a.yml:4:job: run2-load" \
    "a.md:5:網站根目錄是 Run 2" \
    "a.md:6:開 /round1 看 Round1App" \
    "a.md:7:Round 1 的流程" \
    "a.py:8:kind = \"round1_tutor\"" \
    "a.md:9:runs: [round1-e2e]" \
    "deploy/stage/compose.yml:18:      X: \${RUN2_A:-1}" \
    "backend/app/x.py:1:os.environ['RUN2_A']" \
    "AGENTS.md:9:old home was backend/app/run2/ and app.run2.storage" | violations | cut -d: -f1-2 | tr '\n' ' ')
  want="a.yml:2 a.yml:4 a.md:5 a.md:7 a.py:8 a.md:9 backend/app/x.py:1 AGENTS.md:9 "
  if [ "$got" = "$want" ]; then echo "✓ self-test"; exit 0; fi
  echo "✗ self-test: expected [$want] got [$got]"; exit 1
fi

fail=0
report() { # 標題 內容
  [ -n "$2" ] || return 0
  echo "✗ $1（$(echo "$2" | cut -d: -f1 | sort -u | wc -l | tr -d ' ') 個檔案、$(echo "$2" | wc -l | tr -d ' ') 處）:"; echo "$2" | sed 's/^/    /'; fail=1
}

paths=$(git ls-files | grep -v "^$self\$" | grep -iE "run2|portal_|(^|/)[^/]*round[-_]?[12]([^0-9]|$)" | grep -v '^frontend/' || true)
report "路徑含舊名（run2、portal_、round1）" "$paths"

# shellcheck disable=SC2086  # records 是刻意以空白分隔的多個 pathspec
content=$(git grep -In -E "$legacy" -- . ":!$self" $records | violations || true)
report "內容含舊名（run2、Run 2、portal_）" "$content"
# shellcheck disable=SC2086
round_names=$(git grep -In -E "$round_name" -- . ":!$self" ":!frontend/src" $records | violations || true)
report "內容含舊代號（Round 1、round1）" "$round_names"

# 開發回合編號（r2-、g70_、r70:……）不進產品程式：class、CSS 變數、data 屬性、檔名、註解標記都算。
# 放行：說明這條規則本身的檔案。
round='(^|[^A-Za-z0-9])[rRgG][0-9]+[-_:]'
round_allowed=":!AGENTS.md :!backend/tests/migrations/test_no_round_prefix.py"
round_paths=$(git ls-files | grep -v "^$self\$" | grep -E '(^|[/_-])[rRgG][0-9]+[-_.]' || true)
report "路徑含開發回合編號" "$round_paths"
# shellcheck disable=SC2086
round_content=$(git grep -InE "$round" -- . ":!$self" $records $round_allowed || true)
report "內容含開發回合編號" "$round_content"

# 開發工具的內部名稱（席位、工具代號）不進 repo；人名寫 Arthur 或前端組員。
internal='(PO|Portal|Study|Design|subPO|TRPG|ETC|Socratic)-(Heron|Goose)|\b(Heron|Loom|Raven|Finch|Weaver)\b'
# shellcheck disable=SC2086
internal_content=$(git grep -InE "$internal" -- . ":!$self" $records || true)
report "內容含開發工具的內部名稱" "$internal_content"

[ "$fail" -eq 0 ] && echo "✓ 舊名、舊代號、開發回合編號與內部名稱都不在已追蹤檔案中"
exit "$fail"

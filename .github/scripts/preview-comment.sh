#!/usr/bin/env bash
# Keep exactly one preview comment on the PR (found by its marker line) and
# say which commit the site runs versus which one is on its way.
#   usage: preview-comment.sh building|deployed|timeout|failed
# env: GH_TOKEN REPO PR SHA URL RUN_URL
set -euo pipefail

state=$1
marker='<!-- socrates-preview -->'

# shellcheck disable=SC2016  # literal Markdown backticks
link() { printf '[`%s`](https://github.com/%s/commit/%s)' "${1:0:7}" "$REPO" "$1"; }
title() { gh api "repos/$REPO/commits/$1" --jq '.commit.message' 2>/dev/null | head -1 || true; }

# The commit the preview serves right now ("" before the first deploy).
served=$(curl -fsS -m 10 "$URL/api/release" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("source_sha", ""))' 2>/dev/null || true)

head_ref="$(link "$SHA") $(title "$SHA")"
if [ -z "$served" ]; then
  running="網站還沒有部署過。"
elif [ "$served" = "$SHA" ]; then
  running="網站正在執行 PR 最新的 commit：${head_ref}"
else
  running="網站目前仍是舊版：$(link "$served") $(title "$served")"
fi

# A branch from before the preview feature builds an image without the seed:
# the preview runs, but with an empty database.
accounts_note=""
if ! gh api "repos/$REPO/contents/scripts/seed_preview.py?ref=$SHA" >/dev/null 2>&1; then
  accounts_note="> ⚠️ 這個分支還沒有 \`scripts/seed_preview.py\`，所以下面的測試帳號**不存在**（資料庫是空的）。先把 \`develop\` merge 進來就會有。"
fi

case $state in
  building) status="⏳ **正在建置** ${head_ref}，完成後幾分鐘內會自動換上。" ;;
  deployed) status="✅ **已部署最新 commit**" ;;
  timeout) status="⏳ ${head_ref} 已建置完成，但網站還沒換上，請稍候幾分鐘再重新整理。" ;;
  failed) status="❌ ${head_ref} **建置失敗**，請看 [workflow log](${RUN_URL})。" ;;
  *) echo "unknown state: $state" >&2; exit 2 ;;
esac

body=$(cat <<EOF
$marker
### 🔍 預覽環境

**👉 ${URL}**

📜 [看 log](https://logs.socrates.driseam.com/d/socrates-preview?var-namespace=socrates-pr-${PR})・🗄 [查資料庫](https://db-pr-${PR}.socrates.driseam.com)（這兩個要用組內共用帳號 \`socrates\` 登入，密碼問核心組）

$status
$running

每次 push 都會重新建置並更新這則留言。

${accounts_note}

| 帳號 | 身分 |
|---|---|
| \`teacher001\` | 老師，教室 \`PREVIEW1\`（已有 \`user001\`–\`user010\`） |
| \`teacher002\`、\`teacher003\` | 老師，空教室 \`PREVIEW2\`、\`PREVIEW3\` |
| \`user001\`–\`user030\` | 學生 |

密碼都是 \`preview-password\`。這個環境有自己的資料庫；不會真的寄信（驗證連結直接顯示在畫面上），也沒有 LLM 金鑰，需要的話請照 deploy/preview/README.md 申請。
不需要預覽就把 \`preview\` label 拿掉，環境會在幾分鐘內刪除。

<sub>更新於 $(date -u '+%Y-%m-%d %H:%M UTC')・[workflow run](${RUN_URL})</sub>
EOF
)

id=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -1)
if [ -n "$id" ]; then
  gh api -X PATCH "repos/$REPO/issues/comments/$id" -f body="$body" >/dev/null
else
  gh pr comment "$PR" --repo "$REPO" --body "$body" >/dev/null
fi
echo "preview comment: $state"

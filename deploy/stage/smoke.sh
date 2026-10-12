#!/usr/bin/env bash
set -euo pipefail
origin="${1:-http://127.0.0.1:8080}"

curl -fsS "$origin/" >/dev/null
curl -fsS "$origin/api/v2/readiness" |
  python -c 'import json,sys; value=json.load(sys.stdin); assert value["status"]=="ready"'

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
status="$(
  curl -sS \
    -D "$tmp/headers" \
    -o "$tmp/body" \
    -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "Origin: $origin" \
    --data '{}' \
    "$origin/api/v2/auth/login"
)"
test "$status" = "422"
grep -qi '^content-type: application/json' "$tmp/headers"
python - "$tmp/body" <<'PY'
import json,sys
value=json.load(open(sys.argv[1],encoding='utf-8'))
assert "detail" in value
PY

curl -fsS "$origin/__bh__/current.json" |
  python -c 'import json,sys; value=json.load(sys.stdin); assert "source_sha" in value'
echo "STAGE_JSON_AUTH_ROUTE_PASS"

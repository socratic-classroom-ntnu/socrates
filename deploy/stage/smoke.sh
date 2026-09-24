#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
PORT="$(grep -E '^SOCRATES_HTTP_PORT=' deploy/stage/.env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' \r"' || true)"
PORT="${PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
curl -fsS "${BASE}/" >/dev/null
curl -fsS "${BASE}/api/health"
curl -fsS "${BASE}/api/v2/readiness"
curl -fsS "${BASE}/api/release"
python3 scripts/round1_smoke.py "${BASE}/api"

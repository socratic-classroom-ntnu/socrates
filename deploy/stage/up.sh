#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
bash deploy/stage/preflight.sh
export SOCRATES_SOURCE_SHA="$(git rev-parse HEAD)"
PORT="$(grep -E '^SOCRATES_HTTP_PORT=' deploy/stage/.env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' \r"' || true)"
PORT="${PORT:-8080}"
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml up -d --build
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v2/readiness"; then break; fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${PORT}/api/v2/readiness"
curl -fsS "http://127.0.0.1:${PORT}/api/release"

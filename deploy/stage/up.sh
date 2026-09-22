#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${SOCRATES_ENV_FILE:-$ROOT/deploy/stage/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/deploy/stage/.env.example" "$ENV_FILE"
  printf 'Created %s. Set DATABASE_URL, then rerun.\n' "$ENV_FILE"
  exit 2
fi
cd "$ROOT"
docker compose --env-file "$ENV_FILE" -f deploy/stage/compose.yml up -d --build
curl -fsS "http://127.0.0.1:${SOCRATES_HTTP_PORT:-8080}/api/health"
printf '\nSocrates stage is ready for the tunnel at http://127.0.0.1:%s\n' "${SOCRATES_HTTP_PORT:-8080}"

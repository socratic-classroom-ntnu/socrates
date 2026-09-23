#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
export SOCRATES_SOURCE_SHA="$(git rev-parse HEAD)"
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml up -d --build
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${SOCRATES_HTTP_PORT:-8080}/api/v2/readiness"; then break; fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${SOCRATES_HTTP_PORT:-8080}/api/v2/readiness"
curl -fsS "http://127.0.0.1:${SOCRATES_HTTP_PORT:-8080}/api/release"

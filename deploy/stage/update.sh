#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
git fetch origin
git switch stage
git pull --ff-only origin stage
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml up -d --build
./deploy/stage/smoke.sh

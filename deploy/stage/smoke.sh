#!/usr/bin/env bash
set -Eeuo pipefail
PORT="${SOCRATES_HTTP_PORT:-8080}"
curl -fsS "http://127.0.0.1:${PORT}/api/health"
curl -fsS "http://127.0.0.1:${PORT}/api/release"

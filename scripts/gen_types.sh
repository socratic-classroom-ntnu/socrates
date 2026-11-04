#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
    PYTHON_BIN="$ROOT/backend/.venv/bin/python"
  else
    PYTHON_BIN=python3
  fi
fi

mkdir -p "$ROOT/frontend/src/contract"
cd "$ROOT/backend"
"$PYTHON_BIN" -c 'import json; from app.modules.contract.service import solo_openapi; print(json.dumps(solo_openapi(), ensure_ascii=False, indent=2))' \
  > "$ROOT/frontend/openapi.json"

cd "$ROOT/frontend"
npx --no-install openapi-typescript openapi.json -o src/contract/types.ts

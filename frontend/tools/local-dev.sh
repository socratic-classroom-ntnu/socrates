#!/bin/sh
set -eu
key="$(cat package.json; if [ -f package-lock.json ]; then cat package-lock.json; fi)"
key="$(printf '%s' "$key" | sha256sum | cut -d' ' -f1)"
previous="$(cat node_modules/.socrates-lock 2>/dev/null || true)"
if [ "$key" != "$previous" ] || [ ! -x node_modules/.bin/vite ]; then
  # Registry lookups inside the container fail transiently (EAI_AGAIN) while the host is loaded; npm's default 2 fetch attempts give up.
  retries='--fetch-retries=6 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=30000'
  attempt=1
  until if [ -f package-lock.json ]; then npm ci --no-audit --no-fund $retries; else npm install --no-audit --no-fund $retries; fi; do
    if [ "$attempt" -ge 3 ]; then echo "local-dev: dependency install failed after $attempt attempts" >&2; exit 1; fi
    echo "local-dev: dependency install attempt $attempt failed; retrying" >&2
    sleep $((attempt * 15)); attempt=$((attempt + 1))
  done
  key="$(cat package.json; if [ -f package-lock.json ]; then cat package-lock.json; fi)"
  printf '%s' "$key" | sha256sum | cut -d' ' -f1 > node_modules/.socrates-lock
fi
exec npm run dev

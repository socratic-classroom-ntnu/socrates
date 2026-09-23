#!/bin/sh
set -eu
key="$(cat package.json; if [ -f package-lock.json ]; then cat package-lock.json; fi)"
key="$(printf '%s' "$key" | sha256sum | cut -d' ' -f1)"
previous="$(cat node_modules/.socrates-lock 2>/dev/null || true)"
if [ "$key" != "$previous" ] || [ ! -x node_modules/.bin/rsbuild ]; then
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  key="$(cat package.json; if [ -f package-lock.json ]; then cat package-lock.json; fi)"
  printf '%s' "$key" | sha256sum | cut -d' ' -f1 > node_modules/.socrates-lock
fi
exec npm run dev

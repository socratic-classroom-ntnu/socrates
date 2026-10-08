#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

for command_name in docker git curl python3; do
  command -v "$command_name" >/dev/null || {
    echo "missing required command: $command_name" >&2
    exit 1
  }
done

docker info >/dev/null
docker compose version >/dev/null
test -f deploy/stage/.env || {
  echo "copy deploy/stage/.env.example to deploy/stage/.env and fill it first" >&2
  exit 1
}
if grep -Eq 'REPLACE_ME|^DATABASE_URL=$' deploy/stage/.env; then
  echo "deploy/stage/.env still contains an unusable DATABASE_URL" >&2
  exit 1
fi
test -f frontend/package-lock.json || {
  echo "frontend/package-lock.json is required for a reproducible build" >&2
  exit 1
}
test -x scripts/gen_types.sh || {
  echo "scripts/gen_types.sh must be executable" >&2
  exit 1
}
avatar_spec=frontend/public/avatars/ce-brunette/SOURCE.json
if [ ! -f frontend/public/avatars/ce-brunette/avatar.glb ]; then
  avatar_url="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["url"])' "$avatar_spec")"
  curl -fsS -I --max-time 30 "$avatar_url" >/dev/null || {
    echo "the frontend build downloads a pinned avatar and cannot reach ${avatar_url}" >&2
    echo "allow outbound HTTPS to raw.githubusercontent.com, or place avatar.glb at frontend/public/avatars/ce-brunette/" >&2
    exit 1
  }
fi
if grep -Eq '^SOCRATES_MAIL_TRANSPORT=resend' deploy/stage/.env && ! grep -Eq '^RESEND_API_KEY=.+' deploy/stage/.env; then
  echo "warning: RESEND_API_KEY is empty; email verification returns RESEND_API_KEY_REFERENCE_REQUIRED until it is set" >&2
fi
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml config --quiet
echo "stage preflight passed"

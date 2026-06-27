#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
public_base="${DUDESIGN_STAGING_PUBLIC_BASE:-http://49.233.190.201}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"

ssh "$remote" "set -e
cd '$base_dir/dudesign/current'
docker compose -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env ps
curl -fsS -o /tmp/dudesign-local-web.html -w 'local-web:%{http_code}\n' http://127.0.0.1/
curl -fsS -o /tmp/dudesign-local-api.json -w 'local-api:%{http_code}\n' http://127.0.0.1/api/dev/bootstrap
curl -fsS -o /tmp/dudesign-local-admin.html -w 'local-admin:%{http_code}\n' http://127.0.0.1/admin/
"

curl -fsS -o /tmp/dudesign-public-web.html -w 'public-web:%{http_code}\n' "$public_base/"
curl -fsS -o /tmp/dudesign-public-api.json -w 'public-api:%{http_code}\n' "$public_base/api/dev/bootstrap"
curl -fsS -o /tmp/dudesign-public-admin.html -w 'public-admin:%{http_code}\n' "$public_base/admin/"

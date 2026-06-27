#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
public_base="${DUDESIGN_STAGING_PUBLIC_BASE:-http://49.233.190.201}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"

retry_curl() {
  local label="$1"
  local output="$2"
  local url="$3"

  for attempt in 1 2 3 4 5; do
    if curl -fsS -o "$output" -w "${label}:%{http_code}\n" "$url"; then
      return 0
    fi
    sleep "$attempt"
  done

  curl -fsS -o "$output" -w "${label}:%{http_code}\n" "$url"
}

ssh "$remote" "set -e
cd '$base_dir/dudesign/current'
docker compose -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env ps
for attempt in 1 2 3 4 5; do
  if curl -fsS -o /tmp/dudesign-local-web.html -w 'local-web:%{http_code}\n' http://127.0.0.1/ \
    && curl -fsS -o /tmp/dudesign-local-api.json -w 'local-api:%{http_code}\n' http://127.0.0.1/api/dev/bootstrap \
    && curl -fsS -o /tmp/dudesign-local-admin.html -w 'local-admin:%{http_code}\n' http://127.0.0.1/admin/; then
    exit 0
  fi
  sleep \"\$attempt\"
done
curl -fsS -o /tmp/dudesign-local-web.html -w 'local-web:%{http_code}\n' http://127.0.0.1/
curl -fsS -o /tmp/dudesign-local-api.json -w 'local-api:%{http_code}\n' http://127.0.0.1/api/dev/bootstrap
curl -fsS -o /tmp/dudesign-local-admin.html -w 'local-admin:%{http_code}\n' http://127.0.0.1/admin/
"

retry_curl public-web /tmp/dudesign-public-web.html "$public_base/"
retry_curl public-api /tmp/dudesign-public-api.json "$public_base/api/dev/bootstrap"
retry_curl public-admin /tmp/dudesign-public-admin.html "$public_base/admin/"

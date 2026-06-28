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
compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
fi
docker compose \$compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env ps
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  babelo_nexus_key=\"\$(grep -E '^BABELO_NEXUS_API_KEY=' deploy/staging/.env | tail -n 1 | cut -d= -f2-)\"
  babelo_nexus_port=\"\$(grep -E '^BABELO_NEXUS_PORT=' deploy/staging/.env | tail -n 1 | cut -d= -f2-)\"
  runtime_adapter_port=\"\$(grep -E '^RUNTIME_ADAPTER_PORT=' deploy/staging/.env | tail -n 1 | cut -d= -f2-)\"
  babelo_nexus_key=\"\${babelo_nexus_key:-dudesign-staging-babelo-key}\"
  babelo_nexus_port=\"\${babelo_nexus_port:-3300}\"
  runtime_adapter_port=\"\${runtime_adapter_port:-4100}\"
  curl -fsS -o /tmp/babelo-nexus-health.json -H \"authorization: Bearer \$babelo_nexus_key\" \"http://127.0.0.1:\$babelo_nexus_port/health\"
  curl -fsS -o /tmp/dudesign-adapter-health.json \"http://127.0.0.1:\$runtime_adapter_port/v1/health\"
  echo 'raw-babelo-nexus-health:'
  cat /tmp/babelo-nexus-health.json
  echo
  echo 'dudesign-runtime-adapter-health:'
  cat /tmp/dudesign-adapter-health.json
  echo
fi
for attempt in 1 2 3 4 5; do
  if curl -fsS -o /tmp/dudesign-local-web.html -w 'local-web:%{http_code}\n' http://127.0.0.1/ \
    && curl -fsS -o /tmp/dudesign-local-api.json -w 'local-api:%{http_code}\n' http://127.0.0.1/api/dev/bootstrap \
    && curl -fsS -o /tmp/dudesign-local-admin.html -w 'local-admin:%{http_code}\n' http://127.0.0.1/admin/ \
    && curl -fsS -o /tmp/dudesign-runtime-health.json -H 'x-dudesign-admin-role: support' -w 'local-runtime-health:%{http_code}\n' http://127.0.0.1/api/admin/runtime/health; then
    cat /tmp/dudesign-runtime-health.json
    echo
    if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
      if grep -q '\"runtimeVersion\":\"mock\"' /tmp/dudesign-runtime-health.json; then
        echo 'Runtime provider is babel-o but admin health still reports runtimeVersion=mock.' >&2
        exit 1
      fi
    fi
    exit 0
  fi
  sleep \"\$attempt\"
done
curl -fsS -o /tmp/dudesign-local-web.html -w 'local-web:%{http_code}\n' http://127.0.0.1/
curl -fsS -o /tmp/dudesign-local-api.json -w 'local-api:%{http_code}\n' http://127.0.0.1/api/dev/bootstrap
curl -fsS -o /tmp/dudesign-local-admin.html -w 'local-admin:%{http_code}\n' http://127.0.0.1/admin/
curl -fsS -o /tmp/dudesign-runtime-health.json -H 'x-dudesign-admin-role: support' -w 'local-runtime-health:%{http_code}\n' http://127.0.0.1/api/admin/runtime/health
"

retry_curl public-web /tmp/dudesign-public-web.html "$public_base/"
retry_curl public-api /tmp/dudesign-public-api.json "$public_base/api/dev/bootstrap"
retry_curl public-admin /tmp/dudesign-public-admin.html "$public_base/admin/"

"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/smoke-babelo-prompt-remote.sh"

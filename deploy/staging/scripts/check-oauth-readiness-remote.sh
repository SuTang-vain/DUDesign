#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
public_base="${DUDESIGN_STAGING_PUBLIC_BASE:-http://49.233.190.201}"
require_ready="${DUDESIGN_REQUIRE_OAUTH_READY:-false}"

failures=0

warn() {
  echo "oauth-readiness:warn:$*" >&2
  failures=$((failures + 1))
}

info() {
  echo "oauth-readiness:$*"
}

tmp_json="$(mktemp)"
trap 'rm -f "$tmp_json"' EXIT

provider_status_url="${public_base%/}/api/auth/oauth/providers"
info "public-provider-status-url=$provider_status_url"
curl -fsS "$provider_status_url" -o "$tmp_json"

node --input-type=module - "$tmp_json" <<'NODE'
import fs from 'node:fs'

const file = process.argv[2]
const response = JSON.parse(fs.readFileSync(file, 'utf8'))
for (const provider of response.providers ?? []) {
  console.log(`oauth-readiness:provider:${provider.provider}:configured=${provider.configured ? 'true' : 'false'}`)
}
NODE

if ! node --input-type=module - "$tmp_json" <<'NODE'
import fs from 'node:fs'

const file = process.argv[2]
const response = JSON.parse(fs.readFileSync(file, 'utf8'))
const providers = new Map((response.providers ?? []).map(provider => [provider.provider, Boolean(provider.configured)]))
if (providers.get('github') || providers.get('google')) process.exit(0)
process.exit(1)
NODE
then
  warn "no OAuth provider is configured yet"
fi

if [[ "$public_base" != https://* ]]; then
  warn "public base is not HTTPS: $public_base"
fi

if [[ "$public_base" == http://* ]]; then
  https_probe="https://${public_base#http://}"
else
  https_probe="$public_base"
fi

if curl -kfsSI --connect-timeout 5 "${https_probe%/}/login" >/dev/null 2>&1; then
  info "https-probe=ok:${https_probe%/}/login"
else
  warn "HTTPS probe failed for ${https_probe%/}/login"
fi

ssh "$remote" "BASE_DIR=$(printf '%q' "$base_dir") bash -s" <<'REMOTE'
set -euo pipefail

current="$BASE_DIR/dudesign/current"
cd "$current"

echo "oauth-readiness:remote-current=$current"
echo "oauth-readiness:env-file=$(readlink -f deploy/staging/.env 2>/dev/null || echo deploy/staging/.env)"

if command -v certbot >/dev/null 2>&1; then
  echo "oauth-readiness:certbot=installed"
else
  echo "oauth-readiness:certbot=missing"
fi

if command -v nginx >/dev/null 2>&1; then
  echo "oauth-readiness:nginx=installed"
  if sudo test -f /etc/nginx/sites-available/dudesign-staging; then
    server_name="$(sudo awk '/server_name/ {gsub(/;/, "", $0); print $2; exit}' /etc/nginx/sites-available/dudesign-staging)"
    echo "oauth-readiness:nginx-server-name=${server_name:-unknown}"
  fi
else
  echo "oauth-readiness:nginx=missing"
fi

compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
fi

docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T api node --input-type=module - <<'NODE'
const keys = [
  'DUDESIGN_OAUTH_GITHUB_CLIENT_ID',
  'DUDESIGN_OAUTH_GITHUB_CLIENT_SECRET',
  'DUDESIGN_OAUTH_GITHUB_REDIRECT_URI',
  'DUDESIGN_OAUTH_GOOGLE_CLIENT_ID',
  'DUDESIGN_OAUTH_GOOGLE_CLIENT_SECRET',
  'DUDESIGN_OAUTH_GOOGLE_REDIRECT_URI',
]

for (const key of keys) {
  console.log(`oauth-readiness:api-env:${key}=${process.env[key]?.trim() ? 'set' : 'empty'}`)
}
NODE
REMOTE

if [[ "$require_ready" == "true" && "$failures" -gt 0 ]]; then
  echo "oauth-readiness:failed=$failures" >&2
  exit 1
fi

info "completed-with-warnings=$failures"

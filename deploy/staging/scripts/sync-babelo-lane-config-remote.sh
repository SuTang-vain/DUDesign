#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"

ssh "$remote" "BASE_DIR='$base_dir' bash -s" <<'REMOTE'
set -euo pipefail

cd "$BASE_DIR/dudesign/current"

if ! grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  echo 'babelo-lane-config-sync:skipped provider is not babel-o'
  exit 0
fi

if ! grep -Eq '^DUDESIGN_RUNTIME_LANE_MODE=static$|^DUDESIGN_RUNTIME_LANES_JSON=.+$' deploy/staging/.env; then
  echo 'babelo-lane-config-sync:skipped runtime lane mode is not static'
  exit 0
fi

compose_profile_args='--profile babel-o-multilane'
config_file="$(grep -E '^BABELO_NEXUS_CONFIG_FILE=' deploy/staging/.env | tail -n 1 | cut -d= -f2-)"
config_file="${config_file:-}"

if [ "$config_file" != "/data/config.json" ]; then
  echo "babelo-lane-config-sync:skipped unsupported BABELO_NEXUS_CONFIG_FILE=${config_file:-<empty>}"
  exit 0
fi

if ! docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T babel-o-nexus test -s /data/config.json </dev/null; then
  echo 'babelo-lane-config-sync:primary lane missing /data/config.json; configure lane-a first' >&2
  exit 1
fi

tmp_config="/tmp/dudesign-babelo-lane-config.$$.$RANDOM.json"
trap 'rm -f "$tmp_config"' EXIT

docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T babel-o-nexus cat /data/config.json > "$tmp_config" </dev/null

for svc in babel-o-nexus-b babel-o-nexus-c; do
  docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env exec -T "$svc" sh -lc 'mkdir -p /data && cat > /data/config.json && chmod 600 /data/config.json' < "$tmp_config"
done

docker compose $compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env restart babel-o-nexus-b babel-o-nexus-c runtime-adapter >/dev/null

echo 'babelo-lane-config-sync:completed copied /data/config.json from lane-a to lane-b,lane-c and restarted runtime services'
REMOTE

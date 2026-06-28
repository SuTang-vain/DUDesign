#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
commit="$(git -C "$repo_root" rev-parse --short HEAD)"
release="dudesign-${commit}"
archive="$("$repo_root/deploy/staging/scripts/package-release.sh" "$commit")"

scp "$archive" "$remote:$base_dir/releases/${release}.tar.gz"

ssh "$remote" "set -e
mkdir -p '$base_dir/shared/env'
mkdir -p '$base_dir/releases/$release'
rm -rf '$base_dir/releases/$release'
mkdir -p '$base_dir/releases/$release'
tar -xzf '$base_dir/releases/${release}.tar.gz' -C '$base_dir/releases/$release'
ln -sfn '$base_dir/releases/$release' '$base_dir/dudesign/current'
cd '$base_dir/dudesign/current'
if [ ! -f '$base_dir/shared/env/staging.env' ]; then
  cp deploy/staging/staging.env.example '$base_dir/shared/env/staging.env'
  chmod 600 '$base_dir/shared/env/staging.env'
fi
ln -sfn '$base_dir/shared/env/staging.env' deploy/staging/.env
cp deploy/staging/babelo-nexus.Dockerfile /tmp/dudesign-babelo-nexus.Dockerfile
compose_profile_args=''
if grep -Eq '^DUDESIGN_RUNTIME_PROVIDER=babel-o$|^DUDESIGN_RUNTIME_MODE=babel-o$' deploy/staging/.env; then
  compose_profile_args='--profile babel-o'
  babelo_context=\"\$(grep -E '^BABELO_NEXUS_CONTEXT=' deploy/staging/.env | tail -n 1 | cut -d= -f2-)\"
  if [ -n \"\$babelo_context\" ] && [ ! -f \"\$babelo_context/package.json\" ]; then
    echo \"BABELO_NEXUS_CONTEXT does not contain BabeL-O package.json: \$babelo_context\" >&2
    exit 1
  fi
fi
docker compose \$compose_profile_args -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env up -d --build
sudo nginx -t
sudo systemctl reload nginx
"

"$repo_root/deploy/staging/scripts/smoke-remote.sh"

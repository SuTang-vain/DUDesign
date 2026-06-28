#!/usr/bin/env bash
set -euo pipefail

remote="${DUDESIGN_STAGING_REMOTE:-tyy}"
base_dir="${DUDESIGN_STAGING_BASE_DIR:-/home/ubuntu/deployments}"
babelo_root="${BABELO_SOURCE_ROOT:-/Users/tangyaoyue/DEV/BABEL/BabeL-O}"
version="$(node -e "const pkg=require('$babelo_root/package.json'); process.stdout.write(pkg.version || 'source')")"
stamp="$(date +%Y%m%d%H%M%S)"
release="babel-o-${version}-${stamp}"
archive="${TMPDIR:-/tmp}/${release}.tar.gz"

COPYFILE_DISABLE=1 tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='*.tsbuildinfo' \
  -czf "$archive" \
  -C "$(dirname "$babelo_root")" \
  "$(basename "$babelo_root")"

ssh "$remote" "mkdir -p '$base_dir/babel-o/releases'"
scp "$archive" "$remote:$base_dir/babel-o/releases/${release}.tar.gz"

ssh "$remote" "set -e
mkdir -p '$base_dir/babel-o/releases/$release'
tar -xzf '$base_dir/babel-o/releases/${release}.tar.gz' -C '$base_dir/babel-o/releases/$release' --strip-components=1
ln -sfn '$base_dir/babel-o/releases/$release' '$base_dir/babel-o/current'
test -f '$base_dir/babel-o/current/package.json'
echo '$base_dir/babel-o/current'
"

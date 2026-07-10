#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
commit="${1:-$(git -C "$repo_root" rev-parse --short HEAD)}"
archive="${TMPDIR:-/tmp}/dudesign-${commit}.tar.gz"

if [ "${DUDESIGN_STAGING_PACKAGE_WORKTREE:-0}" = "1" ]; then
  archive="${TMPDIR:-/tmp}/dudesign-${commit}-worktree.tar.gz"
  COPYFILE_DISABLE=1 tar \
    --exclude='.git' \
    --exclude='.agents' \
    --exclude='.dudesign' \
    --exclude='node_modules' \
    --exclude='*/node_modules' \
    --exclude='dist' \
    --exclude='*/dist' \
    --exclude='.next' \
    --exclude='*/.next' \
    --exclude='*.tsbuildinfo' \
    -czf "$archive" \
    -C "$repo_root" \
    .
else
  git -C "$repo_root" archive --format=tar.gz -o "$archive" HEAD
fi
printf '%s\n' "$archive"

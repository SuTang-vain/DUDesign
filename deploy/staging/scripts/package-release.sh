#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
commit="${1:-$(git -C "$repo_root" rev-parse --short HEAD)}"
archive="${TMPDIR:-/tmp}/dudesign-${commit}.tar.gz"

git -C "$repo_root" archive --format=tar.gz -o "$archive" HEAD
printf '%s\n' "$archive"

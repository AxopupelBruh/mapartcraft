#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

npm run build

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -a build/. "$tmp/"

cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
git remote add origin "$(git -C "$root" remote get-url origin)"
git push --force origin gh-pages

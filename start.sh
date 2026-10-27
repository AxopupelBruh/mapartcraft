#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

if [ ! -f build/index.html ]; then
  CI=false npm run build
fi

exec node server.js

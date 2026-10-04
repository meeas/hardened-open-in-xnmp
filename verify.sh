#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")/app"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required and was not found in PATH." >&2
  exit 1
fi
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' || {
  echo "Node.js 18 or newer is required." >&2
  exit 1
}
exec node verify.js "$@"

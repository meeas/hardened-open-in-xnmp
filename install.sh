#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")/app"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required and was not found in PATH." >&2
  exit 1
fi
node_path=$(command -v node)
node -e 'const major=Number(process.versions.node.split(".")[0]); process.exit(major >= 18 ? 0 : 1)' || {
  echo "Node.js 18 or newer is required." >&2
  exit 1
}

run_node_path=$node_path
install_args=()
node_path_override_seen=false
for arg in "$@"; do
  case "$arg" in
    --node-path=*)
      if [[ "$node_path_override_seen" == true ]]; then
        echo "Specify --node-path at most once." >&2
        exit 1
      fi
      run_node_path=${arg#--node-path=}
      node_path_override_seen=true
      ;;
    *) install_args+=("$arg") ;;
  esac
done

echo "Using system Node.js: $node_path ($(node --version))"
exec "$node_path" install.js "--node-path=$run_node_path" "${install_args[@]}"

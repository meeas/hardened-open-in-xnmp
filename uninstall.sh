#!/usr/bin/env bash
set -euo pipefail

share="$HOME/.config"
for arg in "$@"; do
  case "$arg" in
    --custom-dir=*) share="${arg#--custom-dir=}" ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done
if [[ "$share" == "~/"* ]]; then share="$HOME/${share:2}"; fi

rm -f -- \
  "$HOME/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/com.add0n.node.json" \
  "$HOME/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/com.add0n.node-proxy-shim" \
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/com.add0n.node.json" \
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/com.add0n.node-proxy-shim" \
  "$HOME/.config/google-chrome/NativeMessagingHosts/com.add0n.node.json" \
  "$HOME/.mozilla/native-messaging-hosts/com.add0n.node.json"

# Clean wrappers left by the previous flatpak-spawn based revision, if present.
rm -f -- \
  "$HOME/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/com.add0n.node.sh" \
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/com.add0n.node.sh"

rm -rf -- "$share/com.add0n.node"

cat <<'MSG'
Hardened native host and NativeMessagingProxy shims removed.

This installer never changes Flatpak permissions, so uninstall does not either.
If org.freedesktop.NativeMessagingProxy was granted only for this bridge, you may
remove/review that user override separately. Do not use `flatpak override --reset`
without first checking for unrelated overrides you want to keep.
MSG

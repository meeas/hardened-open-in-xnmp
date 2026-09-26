# Hardened Open-in XDG Native Messaging Bridge
=================================================

Purpose
-------
This package is intentionally limited to exactly this configuration:

  Google Chrome Flatpak + "Open in Firefox" -> Firefox Flatpak
  Firefox Flatpak       + "Open in Chrome"  -> Google Chrome Flatpak

The browser extensions themselves are not modified.

Architecture
------------
The sandboxed browser launches a tiny com.add0n.node proxy shim using the normal
Native Messaging API. The shim calls:

  org.freedesktop.NativeMessagingProxy.Start()

on the user session D-Bus and relays the returned stdin/stdout/stderr Unix file
descriptors. xdg-native-messaging-proxy then launches the real hardened
com.add0n.node host outside the browser sandbox.

Requirements
------------
* Linux x86-64
* Node.js 18+ already installed on the host
* Google Chrome Flatpak: com.google.Chrome
* Firefox Flatpak: org.mozilla.firefox
* xdg-native-messaging-proxy installed on the host

Fedora/Aurora package name:

  xdg-native-messaging-proxy

Install
-------

  ./install.sh

The installer does NOT grant Flatpak D-Bus permissions automatically. If the
browser packages do not already have the permission, grant only:

  flatpak override --user --talk-name=org.freedesktop.NativeMessagingProxy com.google.Chrome
  flatpak override --user --talk-name=org.freedesktop.NativeMessagingProxy org.mozilla.firefox

Then fully quit and restart both browsers.

Installed files
---------------
Real hardened host:

  ~/.config/com.add0n.node/

Host-side manifests discovered by xdg-native-messaging-proxy:

  ~/.config/google-chrome/NativeMessagingHosts/com.add0n.node.json
  ~/.mozilla/native-messaging-hosts/com.add0n.node.json

Chrome Flatpak frontend:

  ~/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/
    com.add0n.node.json
    com.add0n.node-proxy-shim

Firefox Flatpak frontend:

  ~/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/
    com.add0n.node.json
    com.add0n.node-proxy-shim

Security restrictions
---------------------
* Only the two intended extension identities are present in manifests.
* The sandbox shim verifies the browser-provided extension identity.
* The real host independently verifies the identity reconstructed by
  xdg-native-messaging-proxy.
* Only upstream Linux cmd=exec requests are accepted.
* The extension-provided command is checked but is never executed.
* Chrome can launch only org.mozilla.firefox.
* Firefox can launch only com.google.Chrome.
* Only absolute http:// and https:// URLs are accepted.
* Browser flags, file:, data:, javascript:, arbitrary process options,
  environment injection, stdin injection, arbitrary spawn/exec, VM scripts,
  and module loading are rejected.
* The real host invokes /usr/bin/flatpak with shell=false and a reduced
  environment.

Important residual trust boundary
---------------------------------
Granting a browser Flatpak talk access to org.freedesktop.NativeMessagingProxy
allows processes in that browser sandbox to ask the host-side proxy about
native messaging hosts visible to the proxy. xdg-native-messaging-proxy itself
warns that Native Messaging can expose sandbox-escaping capabilities depending
on what other native hosts are installed.

The com.add0n.node host in this package is deliberately constrained, but the
D-Bus permission is browser-wide, not host-name-specific. Avoid installing
untrusted native messaging hosts and periodically review host manifests.

Extension settings
------------------
Leave custom executable paths and custom command-line arguments empty/default
in both Open-in extensions. This hardened host intentionally rejects them.

Uninstall
---------

  ./uninstall.sh

The uninstaller removes this package's files but does not alter Flatpak user
overrides.

# Decisions

## Accepted: seven Flatpak browsers, existing published extensions (2026-09-26)

Support Chrome, Firefox, Edge, Brave, Chromium, Opera and Vivaldi using the
existing Open-in family. Keep other browser targets and custom/unpacked extension
support out of scope. The [README matrix](../README.md#supported-directions)
reflects store availability, not every theoretical pair of browsers.

## Accepted: extension identity determines the destination

Replace the original Chrome→Firefox / Firefox→Chrome source mapping with exact
extension identities mapped to fixed target browsers. Chromium forks pass the
same origin syntax, so those arguments cannot identify the physical source
browser. Per-browser frontend manifests authorize relevant store identities;
the broker manifest authorizes their union. The host independently restricts
each identity to one target and checks its default command without executing it.
This preserves the capability boundary without granting generic process access.

The trusted registry in app/config.js supplies host mappings, installer metadata
and the generated C allowlist. Rebuild the helper whenever identities change.
Unknown operations and properties fail closed. The tightened validation also
rejects malformed UTF-8, incomplete frames and URLs containing raw whitespace.

## Accepted: shared proxy manifests and detected frontends

Install frontends only for detected supported Flatpaks. Chrome and Firefox are no
longer mandatory together. The proxy's Chromium search path uses the host's
Google Chrome manifest directory even for other Chromium browsers; it does not
search each fork's profile directory. Firefox uses the Mozilla search path.
The installer never grants D-Bus permissions automatically. Uninstall uses the
same registry and removes known frontends regardless of current app detection.

## Retained limitation: process-start acknowledgment

A success response still means that /usr/bin/flatpak spawned, not that it exited
successfully or that a browser displayed the URL. Changing that lifecycle is a
separate behavior decision; missing destinations must not be described as tested
successful launches. See [STATUS.md](STATUS.md) for integration validation gaps.

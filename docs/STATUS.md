# Current status

## Implemented (2026-09-26, uncommitted changes after a27bd75)

- Seven Flatpak browsers: Chrome, Firefox, Edge, Brave, Chromium, Opera, Vivaldi.
- Nineteen published extension identities mapped to fixed destinations; exact
  caller checks in both the Node host and rebuilt C helper.
- Generated shim allowlist shares the registry with installer/host configuration.
- Installer detects supported apps independently, writes per-browser frontends
  and shared proxy manifests; uninstaller uses the same known paths.
- Strict request-field/URL checks, invalid UTF-8 and JSON-type rejection,
  truncated-frame detection, coordinated stream errors without payload logging.
- Compact store/direction matrix and installation instructions in [README](../README.md).
  Upstream evidence is in [COMPATIBILITY.md](COMPATIBILITY.md); accepted choices
  and retained limitations are in [DECISIONS.md](DECISIONS.md).

## Validation and remaining work

- Thirty-two regression tests passed on Node.js 26.8.2: all extension capabilities,
  mismatched targets, malformed inputs, fragmented/multiple frames, mock launches
  and spawn errors, compiled shim allowlist, isolated per-browser installation,
  union manifests, custom paths, idempotent removal preserving unrelated hosts,
  README matrix consistency and clean CLI protocol-error handling.
- Tests use temporary directories and a deliberately invalid D-Bus endpoint;
  no real browsers were launched and no desktop installation was changed.
- C build passed with -Wall -Wextra -Werror. Rebuilt x86-64 artifact retains
  GLIBC 2.34 minimum, PIE, RELRO, immediate binding and non-executable stack.
- Shell syntax, local documentation links, generated-header consistency and
  Git whitespace checks passed. SHA256SUMS was refreshed for the full file set.
- Full browser→shim→real proxy→destination integration remains unverified for
  every new route. Validate in disposable desktop sessions per
  [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md), particularly Opera-store legacy
  extensions, Edge store packages and each browser's native-host discovery.
- Minimum Node.js 18 execution has not yet been checked. No remote CI or release
  publication has been performed.
- Process-start acknowledgment still does not report later Flatpak/browser errors.
- Other browser families, unpacked extensions and missing store directions remain
  out of scope. No implementation blockers remain for the selected registry.

# Current status

## Current validation (2026-10-14)

- Validated the working tree based on `36277ba`, including the Node executable
  override and README table spacing correction. No runtime changes were needed.
- All 34 regression tests passed on Node.js 26.11.0 with test isolation disabled
  outside the sandbox. The sandbox run passed 32 and blocked two child-process
  checks with `EPERM`; the unrestricted run resolved both failures.
- All JavaScript and shell syntax checks, generated-header consistency, 26 local
  documentation links, and Git whitespace checks passed.
- C source compiled to a temporary artifact with `-Wall -Wextra -Werror`.
  The shipped binary passed its loader self-test and retains x86-64 PIE, RELRO,
  immediate binding, a non-executable stack, and GLIBC 2.34 minimum.
- Refreshed the complete `SHA256SUMS` manifest after validation; all 24 entries
  passed verification. The stale installer/test hashes came from the recent
  Node-path commit. The shipped binary was not replaced.
- Remaining validation: minimum Node.js 18, real browser/proxy round trips,
  current store availability, and remote CI/release checks described below.

## Implemented (2026-10-04)

- Seven Flatpak browsers: Chrome, Firefox, Edge, Brave, Chromium, Opera, Vivaldi.
- Nineteen published extension identities mapped to fixed destinations; exact
  caller checks in both the Node host and rebuilt C helper.
- Generated shim allowlist shares the registry with installer/host configuration.
- Installer detects supported apps independently, writes per-browser frontends
  and shared proxy manifests; uninstaller uses the same known paths.
- Read-only `verify.sh` checks detected browsers' installed bridge files,
  manifests, permissions and proxy activation service; it cannot certify
  extension installation or a live browser round trip.
- Strict request-field/URL checks, invalid UTF-8 and JSON-type rejection,
  truncated-frame detection, coordinated stream errors without payload logging.
- Compact store/direction matrix and installation instructions in [README](../README.md).
  Upstream evidence is in [COMPATIBILITY.md](COMPATIBILITY.md); accepted choices
  and retained limitations are in [DECISIONS.md](DECISIONS.md).

## Validation and remaining work

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

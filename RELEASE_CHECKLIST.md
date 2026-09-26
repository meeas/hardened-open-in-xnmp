# Release checklist

- Regenerate `app/shim-allowlist.h` and rebuild/strip the included x86-64 binary
  following [BUILD-SHIM.txt](BUILD-SHIM.txt).
- Run `node scripts/generate-shim-allowlist.js --check` and
  `node --test tests/*.test.js` using the minimum supported Node.js and a current
  supported Node.js version. Check the helper's GLIBC requirement, PIE, RELRO,
  immediate binding and non-executable stack as described in the build guide.
- Run `bash -n install.sh uninstall.sh` and `git diff --check`.
- In disposable desktop environments, install with each supported source browser,
  grant only proxy talk access, and test the [README matrix](README.md#supported-directions).
  Test each applicable store edition, cold/warm destination startup, multiple URLs,
  a missing destination, invalid requests, and uninstall without losing other hosts.
  Do not claim live compatibility from mocked regression tests alone.
- Verify current extension IDs, request formats, browser manifest locations and
  store availability; update [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) and the
  matrix if any change.
- Refresh `SHA256SUMS` after final source, binary and documentation edits:

  ```sh
  rg --files -g '!SHA256SUMS' | LC_ALL=C sort | xargs sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
  ```

- Update [docs/STATUS.md](docs/STATUS.md) with actual evidence and gaps.
- Commit/tag/publish only with explicit authorization; local checks do not prove
  remote CI or release publication.

# Hardened Open-in XDG Native Messaging Bridge

Open HTTP/HTTPS links between supported Linux Flatpak browsers using the existing
[Open-in extension family](https://webextension.org/listing/open-in.html).
The extensions are not modified. Each approved extension can launch only its
named destination browser.

## Supported directions

Read **across a row**: install “Open in [column browser]” in the source browser.
Letters identify the extension store: **C** = Chrome Web Store, **F** = Firefox
Add-ons, **E** = Edge Add-ons, **O** = Opera Add-ons. **—** = not offered by this
bridge (including same-browser transfers).

| From ↓ / To → | Chrome | Firefox | Edge | Brave | Chromium | Opera | Vivaldi |
|---|---|---|---|---|---|---|---|
| Chrome | — | C | C | C | C | C | — |
| Firefox | F | — | F | F | F | F | F |
| Edge | E | E/C | — | C | C | E/C | — |
| Brave | — | C | C | — | C | C | — |
| Chromium | — | C | C | C | — | C | — |
| Opera | O | O/C | O/C | C | O/C | — | O |
| Vivaldi | — | C | C | C | C | C | — |

Use the family catalog above to choose the exact extension; similarly named
extensions from other developers are not authorized. Both browsers must be
installed as the Flatpak applications listed in [app/config.js](app/config.js).
A store entry is required for the indicated source browser; the installer does
not install extensions or enable other extension stores for you.

In particular, **Brave → Chrome is not included**: there is no Chrome Web Store
edition of this family's Open in Chrome in the verified catalog. Chrome is
reachable from Firefox, Edge and Opera. Vivaldi is reachable from Firefox and
Opera. Unpacked extensions, repackaging and custom executable substitutions are
outside this support matrix.

The matrix describes implemented routes and store availability, **not a completed
live-browser certification**. Automated tests cover routing, manifests and the
compiled caller allowlist; real browser/proxy round trips remain to be checked.
Store versions and evidence are recorded in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).
Yandex, Waterfox, Tor, Pale Moon, Safari and Internet Explorer are not included.

## Install

Requirements: x86-64 Linux, host Node.js 18+, `/usr/bin/flatpak`, at least one
supported browser Flatpak, and host `xdg-native-messaging-proxy`. The included
helper needs GLIBC 2.34+ and GLib/GIO libraries inside the browser runtime.

```sh
./install.sh
```

The installer detects supported browsers and installs their frontends. It no
longer requires Chrome and Firefox together. Re-run it after adding another
supported browser. Install the destination Flatpak before sending links to it.

If a browser lacks proxy D-Bus permission, the installer prints the exact command
needed, for example:

```sh
flatpak override --user --talk-name=org.freedesktop.NativeMessagingProxy com.microsoft.Edge
```

Permissions are **not changed automatically**. Fully quit and restart affected
browsers after changing them. Install the appropriate extensions from the matrix
and leave their executable paths and custom command arguments empty/default.
Do not install the generic upstream native client over this hardened host.

To put the host application elsewhere:

```sh
./install.sh --custom-dir="$HOME/.local/share"
```

Use that same option when uninstalling. The option moves only the host application;
browser manifests remain in their standard locations. Run these scripts as your
normal desktop user, without sudo.

By default, `run.sh` uses the Node.js executable found on `PATH` during
installation. To embed a different absolute executable path, such as Homebrew's
upgrade-stable link, use `--node-path`:

```sh
./install.sh --node-path=/home/linuxbrew/.linuxbrew/bin/node
```

This option can be combined with `--custom-dir`.

Check the installation after setup or after adding a browser:

```sh
./verify.sh
# If installed with a custom directory:
./verify.sh --custom-dir="$HOME/.local/share"
```

Verification checks every detected supported browser's frontend, the shared host
files and manifests, proxy activation service, and D-Bus talk permission. It exits
nonzero and lists issues if anything is missing or differs from this checkout.
Browser extension installation and actual link opening still need a manual check.

## How it works

```text
Browser extension → sandbox C helper → NativeMessagingProxy over D-Bus
                  → host run.sh → Node.js validation → fixed Flatpak browser
```

The helper relays Native Messaging bytes without interpreting JSON. The Node.js
host validates the caller identity and request, then invokes `/usr/bin/flatpak`
with an argument array, no shell, and a reduced environment. Its response confirms
that the Flatpak process started; it does not prove the browser opened the page.

Installed locations:

- Host application: `~/.config/com.add0n.node/` by default.
- Proxy manifests: `~/.config/google-chrome/NativeMessagingHosts/` for Chromium
  sources and `~/.mozilla/native-messaging-hosts/` for Firefox. The Chrome-named
  directory is needed by the proxy even for an Edge-only installation.
- Sandbox frontends: `~/.var/app/<application-id>/` under each browser's configured
  Native Messaging directory. The installer prints these paths.

The installer replaces this host's existing files/manifests. It does not modify
other native host names. Uninstall removes this host rather than restoring any
previous generic `com.add0n.node` installation.

## Security and limits

Only exact, allowlisted extension identities and their fixed destination mappings
are accepted. Requests must use `cmd: "exec"`, the expected default command name,
and 1–256 absolute HTTP/HTTPS URL arguments. The command name is checked but never
executed. Arbitrary process options, flags, other URI schemes, custom paths and
unknown request fields are rejected. Requests are limited to 1 MiB and individual
URLs to 16,384 UTF-16 code units.

The extension's optional native-client diagnostic/version and executable-finder
features are not implemented; test normal link opening instead. Compared with the
original bridge, unexpected fields, whitespace/control characters in URLs and
incomplete/invalid UTF-8 messages are now explicitly rejected.

Proxy D-Bus permission applies to the whole browser sandbox and is not restricted
to this host name. Other native hosts visible to the proxy remain a separate trust
boundary. Caller arguments are allowlist checks, not proof of the originating
process. See [SECURITY-NOTES.md](SECURITY-NOTES.md) for the security contract.

## Uninstall

```sh
./uninstall.sh
```

Node.js is required for uninstall as well as install. This removes known frontends
for all seven browsers, including browsers removed since installation. Flatpak
permission overrides are left unchanged; review them separately if the bridge was
their only purpose.

## Development

```sh
node --test tests/*.test.js
node scripts/generate-shim-allowlist.js --check
sha256sum --check SHA256SUMS
```

Tests mock browser launches and install only into temporary directories. The
compiled helper is checked using an intentionally nonexistent session bus.
See [BUILD-SHIM.txt](BUILD-SHIM.txt) for rebuilding, [docs/STATUS.md](docs/STATUS.md)
for validation gaps, and [docs/DECISIONS.md](docs/DECISIONS.md) for design decisions.

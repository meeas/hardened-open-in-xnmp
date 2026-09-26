# Compatibility evidence

Research date: 2026-09-26. This records upstream identities and request contracts;
see [STATUS.md](STATUS.md) for actual local checks and pending integration tests.

## Published extensions

The [family catalog](https://webextension.org/listing/open-in.html) supplies store
links. Exact identities in [app/config.js](../app/config.js) were cross-checked
with the upstream [native-client registry](https://github.com/andy-portmen/native-client/blob/84a661aa09e8405ac04402eccfe35ccdcc0cc72e/config.js).
Only the seven approved browser targets were taken from that registry.

Published Chrome Web Store packages were downloaded for source inspection only:

| Destination | Version | Manifest |
|---|---|---|
| Firefox | 0.5.0 | V3 |
| Edge | 0.3.4 | V3 |
| Brave | 0.2.1 | V3 |
| Chromium | 0.2.4 | V3 |
| Opera | 0.3.4 | V3 |

Firefox Add-ons API IDs and downloaded packages were checked:

| Destination | Store slug | Version |
|---|---|---|
| Chrome | open-in-chrome-browser | 0.3.8 |
| Edge | open-in-microsoft-edge-browser | 0.3.4 |
| Brave | open-in-brave-browser | 0.2.0 |
| Chromium | open-in-chromium-browser | 0.2.4 |
| Opera | open-in-opera-browser | 0.3.4 |
| Vivaldi | open-in-vivaldi | 0.2.0 |

These packages use cmd=exec, command, arguments and empty properties on Linux.
The accepted commands are google-chrome, firefox, microsoft-edge, brave-browser,
chromium, opera and vivaldi. Only the command corresponding to the authenticated
allowlist identity is accepted. No upstream downloaded code is executed by tests.

Opera/Edge store identities come from the catalog and upstream native-client
registry. Their installed package versions and runtime compatibility have not
been certified locally. In particular, older Opera-store editions may depend on
Manifest V2 support. The matrix does not promise compatibility after a browser
or store withdraws an extension. Same-name extensions outside this family are
not substitutes.

## Source repositories examined

- [Open-in family](https://github.com/andy-portmen/open-in/tree/b1981c98d2d5b0b1cf11ab17855fd5ce210258d9): Vivaldi and shared older request logic.
- [Open in Chrome](https://github.com/andy-portmen/open-in-chrome/tree/d5ec4252ebfb8a049c841bca21844cc5f6b4bfee).
- [Open in Firefox](https://github.com/andy-portmen/open-in-firefox/tree/0238bba0d2ffc5c2bb46cba4566fc6d2611ee069).
- [Open in Edge](https://github.com/Rynu/open-in-edge/tree/8509907b3b6961e70d8ae474b73acb5d311c6288): the andy-portmen repository redirects here.
- [Open in Opera](https://github.com/andy-portmen/open-in-opera/tree/0757c3f92be8c9038d429b5237b0754cbd4dad35).
- [Open in Chromium](https://github.com/andy-portmen/open-in-chromium/tree/d2cb656428f2d9f76f29169e2b8c20c57deee4bc).

## Manifest locations

Browser-side locations follow the upstream
[Linux installer](https://github.com/andy-portmen/native-client/blob/84a661aa09e8405ac04402eccfe35ccdcc0cc72e/linux/app/install.js),
except Edge uses Microsoft's documented `microsoft-edge/NativeMessagingHosts`
path rather than upstream's `microsoftedge` spelling. See
[Microsoft's Linux native messaging documentation](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging).
Opera uses `config/google-chrome/NativeMessagingHosts` within its own Flatpak
application directory, as specified by the upstream installer.

Host-side locations follow
[xdg-native-messaging-proxy's search paths](https://github.com/flatpak/xdg-native-messaging-proxy/blob/4aaa0c494ffa956b52bafb4fef36f35c2f2a7424/src/xnmp-impl.c).
Nondefault user-data directories, beta channels and custom XDG/proxy search-path
overrides are not configured by this installer.

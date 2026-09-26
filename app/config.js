'use strict';

// Hardened configuration for exactly two extensions:
//   Chrome Flatpak  + Open in Firefox -> Firefox Flatpak
//   Firefox Flatpak + Open in Chrome  -> Chrome Flatpak
//
// Both upstream extensions explicitly connect to "com.add0n.node".
exports.name = 'com.add0n.node';
exports.description = 'Hardened Open-in browser bridge via xdg-native-messaging-proxy';
exports.proxy = Object.freeze({
  busName: 'org.freedesktop.NativeMessagingProxy',
  objectPath: '/org/freedesktop/nativemessagingproxy'
});

exports.sources = Object.freeze({
  chrome: Object.freeze({
    extensionId: 'lmeddoobegbaiopohmpmmobpnpjifpii', // Open in Firefox (Chrome Web Store)
    origin: 'chrome-extension://lmeddoobegbaiopohmpmmobpnpjifpii/',
    expectedCommand: 'firefox',
    targetFlatpak: 'org.mozilla.firefox'
  }),
  firefox: Object.freeze({
    extensionId: '{086f665e-6a55-4107-9147-f9a14e72b137}', // Open in Chrome (Firefox)
    expectedCommand: 'google-chrome',
    targetFlatpak: 'com.google.Chrome'
  })
});

exports.security = Object.freeze({
  allowedSchemes: Object.freeze(['http:', 'https:']),
  maxUrls: 256,
  maxUrlLength: 16 * 1024,
  maxMessageBytes: 1024 * 1024
});

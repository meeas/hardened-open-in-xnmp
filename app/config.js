'use strict';

/** Trusted browser/extension registry. Requests cannot supply executable mappings.
 * See docs/COMPATIBILITY.md for upstream provenance and supported source browsers.
 */
function freeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

exports.name = 'com.add0n.node';
exports.description = 'Hardened Open-in browser bridge via xdg-native-messaging-proxy';
exports.proxy = freeze({
  busName: 'org.freedesktop.NativeMessagingProxy',
  objectPath: '/org/freedesktop/nativemessagingproxy'
});

// manifestDir is relative to ~/.var/app/<appId>/, not a host profile path.
exports.browsers = freeze({
  chrome: {appId: 'com.google.Chrome', command: 'google-chrome', mode: 'chromium',
    manifestDir: 'config/google-chrome/NativeMessagingHosts', stores: ['chrome']},
  firefox: {appId: 'org.mozilla.firefox', command: 'firefox', mode: 'mozilla',
    manifestDir: '.mozilla/native-messaging-hosts', stores: ['firefox']},
  edge: {appId: 'com.microsoft.Edge', command: 'microsoft-edge', mode: 'chromium',
    manifestDir: 'config/microsoft-edge/NativeMessagingHosts', stores: ['chrome', 'edge']},
  brave: {appId: 'com.brave.Browser', command: 'brave-browser', mode: 'chromium',
    manifestDir: 'config/BraveSoftware/Brave-Browser/NativeMessagingHosts', stores: ['chrome']},
  chromium: {appId: 'org.chromium.Chromium', command: 'chromium', mode: 'chromium',
    manifestDir: 'config/chromium/NativeMessagingHosts', stores: ['chrome']},
  opera: {appId: 'com.opera.Opera', command: 'opera', mode: 'chromium',
    manifestDir: 'config/google-chrome/NativeMessagingHosts', stores: ['chrome', 'opera']},
  vivaldi: {appId: 'com.vivaldi.Vivaldi', command: 'vivaldi', mode: 'chromium',
    manifestDir: 'config/vivaldi/NativeMessagingHosts', stores: ['chrome']}
});

// Each extension can open ONE destination, independent of its source browser.
exports.extensions = freeze([
  {store: 'chrome', target: 'firefox', id: 'lmeddoobegbaiopohmpmmobpnpjifpii'},
  {store: 'chrome', target: 'edge', id: 'mjoebkkejejidnkfdekpbooceogbapnf'},
  {store: 'chrome', target: 'opera', id: 'amojccmdnkdlcjcplmkijeenigbhfbpd'},
  {store: 'chrome', target: 'chromium', id: 'bhfenhhfpcpkknkahnlogooiodcofkjl'},
  {store: 'chrome', target: 'brave', id: 'mgmnomlncpmfgelhofilonnecmbdaoia'},
  {store: 'edge', target: 'firefox', id: 'ajgodcbbfnpdbopgmfcgdbfhabbnilbp'},
  {store: 'edge', target: 'opera', id: 'eokgbaidifojhfknoiicmnffiaakelpm'},
  {store: 'edge', target: 'chrome', id: 'hkjcboammhlecfomgabecgoppnncbhjp'},
  {store: 'opera', target: 'firefox', id: 'hhalgjmpmjelidhhjldondajffjbcmcg'},
  {store: 'opera', target: 'edge', id: 'jjlkfjglmelpbkgfeebcdipalggpapag'},
  {store: 'opera', target: 'chrome', id: 'gmdcejkkcimnbfmicdpohgicekomipde'},
  {store: 'opera', target: 'chromium', id: 'dilpigogejfnnahbbmnpjmccammdaiom'},
  {store: 'opera', target: 'vivaldi', id: 'ldoihpohemnbokndocafmiblepbjeacb'},
  {store: 'firefox', target: 'chrome', id: '{086f665e-6a55-4107-9147-f9a14e72b137}'},
  {store: 'firefox', target: 'edge', id: '{94782f74-1a58-4332-a803-00006221a9d0}'},
  {store: 'firefox', target: 'opera', id: '{8db82a75-48fd-452a-81cf-bd40b2e60dac}'},
  {store: 'firefox', target: 'chromium', id: '{4d3bd246-4326-4ec1-bb49-a27cfd57ca08}'},
  {store: 'firefox', target: 'brave', id: '{c88f6be2-3757-446b-be27-27eedddbcae0}'},
  {store: 'firefox', target: 'vivaldi', id: '{0bcb72f8-7da8-4071-905c-2de13f5aad3a}'}
]);

/** Return the exact native caller identity for a trusted extension record. */
exports.identity = extension => extension.store === 'firefox' ? extension.id :
  `chrome-extension://${extension.id}/`;

/** Return published extensions for a source, excluding same-browser targets. */
exports.extensionsForBrowser = name => {
  const browser = Object.hasOwn(exports.browsers, name) && exports.browsers[name];
  if (!browser) throw new Error('Unknown source browser');
  return exports.extensions.filter(e => browser.stores.includes(e.store) && e.target !== name);
};

exports.security = freeze({
  allowedSchemes: ['http:', 'https:'], maxUrls: 256,
  maxUrlLength: 16 * 1024, maxMessageBytes: 1024 * 1024
});

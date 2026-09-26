'use strict';

/** Shared installation layout; all paths derive from trusted registry entries.
 * Only --custom-dir changes the host application directory. Browser manifests
 * remain in standard per-user locations, including the proxy's search paths.
 */
const path = require('path');
const config = require('./config');

function options(argv, home) {
  if (!home || !path.isAbsolute(home)) throw new Error('HOME must be an absolute path');
  if (argv.length > 1 || argv.some(a => !a.startsWith('--custom-dir=') || !a.slice(13))) {
    throw new Error('Usage: [--custom-dir=/absolute/or/relative/path]');
  }
  let share = argv.length ? argv[0].slice(13) : path.join(home, '.config');
  if (share.startsWith('~/')) share = path.join(home, share.slice(2));
  return {home, share: path.resolve(share)};
}

function layout({home, share}) {
  const appDir = path.join(share, config.name);
  return {
    appDir,
    runPath: path.join(appDir, 'run.sh'),
    // The proxy searches Chrome/Chromium locations even when called by Edge,
    // Brave, Opera or Vivaldi. These are broker manifests, not source profiles.
    hosts: {
      chromium: path.join(home, '.config/google-chrome/NativeMessagingHosts'),
      mozilla: path.join(home, '.mozilla/native-messaging-hosts')
    },
    frontends: Object.fromEntries(Object.entries(config.browsers).map(([name, browser]) =>
      [name, path.join(home, '.var/app', browser.appId, browser.manifestDir)]))
  };
}

/** Make a stdio manifest with exact identities, never wildcard authorization. */
function manifest(mode, executablePath, extensions) {
  return {
    name: config.name, description: config.description, path: executablePath, type: 'stdio',
    [mode === 'mozilla' ? 'allowed_extensions' : 'allowed_origins']:
      [...new Set(extensions.map(config.identity))]
  };
}

module.exports = {options, layout, manifest};

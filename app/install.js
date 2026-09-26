'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const config = require('./config');

if (process.platform !== 'linux') {
  console.error('This hardened package supports Linux only.');
  process.exit(1);
}
if (process.arch !== 'x64') {
  console.error(`The included proxy shim is x86-64; this machine is ${process.arch}.`);
  console.error('Rebuild app/native-messaging-proxy-shim.c for this architecture before installing.');
  process.exit(1);
}

const home = process.env.HOME;
if (!home || !path.isAbsolute(home)) {
  console.error('HOME must be an absolute path.');
  process.exit(1);
}

let share = process.argv
  .filter(arg => arg.startsWith('--custom-dir='))
  .map(arg => arg.slice('--custom-dir='.length))[0] || path.join(home, '.config');
if (share.startsWith('~/')) share = path.join(home, share.slice(2));
share = path.resolve(share);

const unknownArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--custom-dir='));
if (unknownArgs.length) {
  console.error(`Unknown argument(s): ${unknownArgs.join(' ')}`);
  process.exit(2);
}

const appDir = path.join(share, config.name);
const runPath = path.join(appDir, 'run.sh');
const shimSource = path.join(__dirname, 'native-messaging-proxy-shim');

const browsers = Object.freeze({
  chrome: {
    appId: 'com.google.Chrome',
    sandboxManifestDir: path.join(home, '.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts'),
    hostManifestDir: path.join(home, '.config/google-chrome/NativeMessagingHosts'),
    manifestType: 'chrome'
  },
  firefox: {
    appId: 'org.mozilla.firefox',
    sandboxManifestDir: path.join(home, '.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts'),
    hostManifestDir: path.join(home, '.mozilla/native-messaging-hosts'),
    manifestType: 'firefox'
  }
});

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function secureDir(dir) {
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) {
    throw new Error(`Refusing non-directory or symlink path: ${dir}`);
  }
  fs.chmodSync(dir, 0o700);
}

function atomicWrite(filename, data, mode) {
  const dir = path.dirname(filename);
  secureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filename)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'wx', mode);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  }
  finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, filename);
}

function copyAtomic(source, destination, mode) {
  atomicWrite(destination, fs.readFileSync(source), mode);
}

function flatpak(args) {
  return spawnSync('/usr/bin/flatpak', args, {encoding: 'utf8'});
}

function installedFlatpaks() {
  const result = flatpak(['list', '--app', '--columns=application']);
  if (result.error) throw new Error(`Unable to execute /usr/bin/flatpak: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`flatpak list failed: ${(result.stderr || '').trim()}`);
  return new Set(result.stdout.split('\n').map(s => s.trim()).filter(Boolean));
}

function permissionText(appId) {
  const result = flatpak(['info', '--show-permissions', appId]);
  return result.status === 0 ? result.stdout : '';
}

function hasTalkPermission(appId, busName) {
  const text = permissionText(appId);
  const escaped = busName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}=talk$`, 'm').test(text);
}

function hasBroadFlatpakPermission(appId) {
  return hasTalkPermission(appId, 'org.freedesktop.Flatpak');
}

function proxyInstalled() {
  const files = [
    '/usr/share/dbus-1/services/org.freedesktop.NativeMessagingProxy.service',
    '/usr/local/share/dbus-1/services/org.freedesktop.NativeMessagingProxy.service'
  ];
  return files.some(filename => fs.existsSync(filename));
}

function createApplication() {
  secureDir(appDir);
  copyAtomic(path.join(__dirname, 'host.js'), path.join(appDir, 'host.js'), 0o600);
  copyAtomic(path.join(__dirname, 'messaging.js'), path.join(appDir, 'messaging.js'), 0o600);
  copyAtomic(path.join(__dirname, 'config.js'), path.join(appDir, 'config.js'), 0o600);

  const node = process.execPath;
  // Preserve the native-messaging argv supplied by xdg-native-messaging-proxy.
  const run = `#!/bin/sh\nset -eu\nexec ${shellQuote(node)} "$(dirname -- "$0")/host.js" "$@"\n`;
  atomicWrite(runPath, run, 0o700);
}

function makeManifest(sourceName, executablePath) {
  const source = config.sources[sourceName];
  const browser = browsers[sourceName];
  const manifest = {
    name: config.name,
    description: config.description,
    path: executablePath,
    type: 'stdio'
  };
  if (browser.manifestType === 'chrome') {
    manifest.allowed_origins = [source.origin];
  }
  else {
    manifest.allowed_extensions = [source.extensionId];
  }
  return JSON.stringify(manifest, null, 2) + '\n';
}

function createHostManifest(sourceName) {
  const browser = browsers[sourceName];
  secureDir(browser.hostManifestDir);
  atomicWrite(
    path.join(browser.hostManifestDir, `${config.name}.json`),
    makeManifest(sourceName, runPath),
    0o600
  );
}

function createSandboxFrontend(sourceName) {
  const browser = browsers[sourceName];
  secureDir(browser.sandboxManifestDir);

  const shimPath = path.join(browser.sandboxManifestDir, `${config.name}-proxy-shim`);
  copyAtomic(shimSource, shimPath, 0o700);
  atomicWrite(
    path.join(browser.sandboxManifestDir, `${config.name}.json`),
    makeManifest(sourceName, shimPath),
    0o600
  );
}

function main() {
  if (!fs.existsSync('/usr/bin/flatpak')) throw new Error('/usr/bin/flatpak was not found');
  if (!fs.existsSync(shimSource)) throw new Error('Included Native Messaging proxy shim is missing');

  const installed = installedFlatpaks();
  for (const browser of Object.values(browsers)) {
    if (!installed.has(browser.appId)) throw new Error(`Required Flatpak is not installed: ${browser.appId}`);
  }

  createApplication();
  createHostManifest('chrome');
  createHostManifest('firefox');
  createSandboxFrontend('chrome');
  createSandboxFrontend('firefox');

  console.log(`\nHardened host installed in:\n  ${appDir}`);
  console.log('\nHost-side manifests for xdg-native-messaging-proxy:');
  console.log(`  ${path.join(browsers.chrome.hostManifestDir, `${config.name}.json`)}`);
  console.log(`  ${path.join(browsers.firefox.hostManifestDir, `${config.name}.json`)}`);
  console.log('\nSandbox frontends installed for:');
  console.log(`  ${browsers.chrome.appId}`);
  console.log(`  ${browsers.firefox.appId}`);

  if (!proxyInstalled()) {
    console.log('\nWARNING: org.freedesktop.NativeMessagingProxy D-Bus activation was not found.');
    console.log('Install Fedora\'s xdg-native-messaging-proxy package before using the extensions.');
  }

  const missing = Object.values(browsers)
    .filter(browser => !hasTalkPermission(browser.appId, config.proxy.busName))
    .map(browser => browser.appId);

  if (missing.length) {
    console.log('\nREQUIRED: the browser Flatpaks need narrowly scoped access to:');
    console.log(`  ${config.proxy.busName}`);
    console.log('The installer deliberately did NOT change Flatpak permissions. Grant it with:');
    for (const appId of missing) {
      console.log(`  flatpak override --user --talk-name=${config.proxy.busName} ${appId}`);
    }
    console.log('Then fully quit and restart both browsers.');
  }

  const broad = Object.values(browsers).filter(browser => hasBroadFlatpakPermission(browser.appId));
  if (broad.length) {
    console.log('\nSECURITY WARNING: these browsers still have org.freedesktop.Flatpak talk access:');
    for (const browser of broad) console.log(`  ${browser.appId}`);
    console.log('That broad permission is NOT needed by this proxy-based implementation.');
    console.log('Review your user overrides and remove it if it was granted only for the old bridge.');
  }

  console.log('\nExtension settings: leave custom executable path and custom arguments empty/default.');
  console.log('Only http:// and https:// URLs are accepted by the hardened host.');
}

try { main(); }
catch (err) {
  console.error(`Installation failed: ${err.message}`);
  process.exit(1);
}

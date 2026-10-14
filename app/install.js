'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const config = require('./config');
const {options, layout, manifest} = require('./installation');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function secureDir(dir) {
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`Refusing non-directory or symlink path: ${dir}`);
  fs.chmodSync(dir, 0o700);
}

/** Replace one file atomically; refuse a symlink at the containing directory.
 * This is not a transaction across the installation, nor an ancestor-symlink defense.
 */
function atomicWrite(filename, data, mode) {
  const dir = path.dirname(filename);
  secureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filename)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'wx', mode);
  try {
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    }
    finally { fs.closeSync(fd); }
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, filename);
  }
  finally { fs.rmSync(tmp, {force: true}); }
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

function hasTalkPermission(appId, busName) {
  const result = flatpak(['info', '--show-permissions', appId]);
  return result.status === 0 && result.stdout.split('\n').includes(`${busName}=talk`);
}

/** Install frontends for detected browsers and broker manifests for their modes.
 * No Flatpak permissions or extensions are installed. installed is an app-ID Set;
 * it is injectable so installation can be tested in a temporary home directory.
 * Returns the installed browser names and paths. Throws if no supported app exists.
 */
function install(settings, installed, nodeExecutable = process.execPath) {
  const selected = Object.keys(config.browsers).filter(name => installed.has(config.browsers[name].appId));
  if (!selected.length) throw new Error('No supported browser Flatpaks are installed');
  if (!path.isAbsolute(nodeExecutable)) throw new Error('Node.js path must be absolute');
  try { fs.accessSync(nodeExecutable, fs.constants.X_OK); }
  catch { throw new Error(`Node.js path is not executable: ${nodeExecutable}`); }
  const paths = layout(settings);
  const shim = fs.readFileSync(path.join(__dirname, 'native-messaging-proxy-shim'));
  secureDir(paths.appDir);
  for (const name of ['host.js', 'messaging.js', 'config.js']) {
    atomicWrite(path.join(paths.appDir, name), fs.readFileSync(path.join(__dirname, name)), 0o600);
  }
  const run = `#!/bin/sh\nset -eu\nexec ${shellQuote(nodeExecutable)} "$(dirname -- "$0")/host.js" "$@"\n`;
  atomicWrite(paths.runPath, run, 0o700);

  const byMode = {chromium: [], mozilla: []};
  for (const name of selected) {
    const browser = config.browsers[name];
    const extensions = config.extensionsForBrowser(name);
    byMode[browser.mode].push(...extensions);
    const dir = paths.frontends[name];
    const shimPath = path.join(dir, `${config.name}-proxy-shim`);
    atomicWrite(shimPath, shim, 0o700);
    atomicWrite(path.join(dir, `${config.name}.json`),
      JSON.stringify(manifest(browser.mode, shimPath, extensions), null, 2) + '\n', 0o600);
  }
  for (const [mode, extensions] of Object.entries(byMode)) {
    if (extensions.length) {
      atomicWrite(path.join(paths.hosts[mode], `${config.name}.json`),
        JSON.stringify(manifest(mode, paths.runPath, extensions), null, 2) + '\n', 0o600);
    }
  }
  return {selected, paths};
}

function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('The included proxy shim requires x86-64 Linux');
  }
  const args = process.argv.slice(2);
  const nodePathArgs = args.filter(arg => arg.startsWith('--node-path='));
  if (nodePathArgs.length > 1) throw new Error('Specify --node-path at most once');
  const nodeExecutable = nodePathArgs.length ? nodePathArgs[0].slice('--node-path='.length) : process.execPath;
  const settings = options(args.filter(arg => !arg.startsWith('--node-path=')), process.env.HOME);
  const {selected, paths} = install(settings, installedFlatpaks(), nodeExecutable);
  console.log(`Hardened host installed in:\n  ${paths.appDir}`);
  console.log('Sandbox frontends installed for:');
  for (const name of selected) console.log(`  ${name}: ${paths.frontends[name]}`);
  console.log('Other browsers were skipped. Re-run install.sh after adding a supported browser.');

  if (!['/usr/share', '/usr/local/share'].some(dir =>
    fs.existsSync(path.join(dir, 'dbus-1/services/org.freedesktop.NativeMessagingProxy.service')))) {
    console.log('\nWARNING: NativeMessagingProxy D-Bus activation was not found.');
    console.log('Install xdg-native-messaging-proxy before using the extensions.');
  }
  const missing = selected.filter(name => !hasTalkPermission(config.browsers[name].appId, config.proxy.busName));
  if (missing.length) {
    console.log('\nThe installer did NOT change Flatpak permissions. Grant proxy access with:');
    for (const name of missing) {
      console.log(`  flatpak override --user --talk-name=${config.proxy.busName} ${config.browsers[name].appId}`);
    }
    console.log('Then fully quit and restart the affected browsers.');
  }
  const broad = selected.filter(name => hasTalkPermission(config.browsers[name].appId, 'org.freedesktop.Flatpak'));
  if (broad.length) {
    console.log(`\nWARNING: unnecessary org.freedesktop.Flatpak talk access: ${broad.join(', ')}`);
    console.log('Review your overrides; that permission is not needed by this implementation.');
  }
  console.log('\nInstall the matching Open-in extensions from the stores in the README matrix.');
  console.log('Leave custom paths/arguments empty; destination Flatpaks must be installed.');
}

if (require.main === module) {
  try { main(); }
  catch (err) { console.error(`Installation failed: ${err.message}`); process.exitCode = 1; }
}
module.exports = {install};

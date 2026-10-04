'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const config = require('./config');
const {options, layout, manifest} = require('./installation');

/** Inspect installed browser bridge files without changing them. Returns issue text.
 * The installed app IDs are supplied by the caller to allow isolated checks.
 */
function verify(settings, installed, hasPermission, serviceRoots = ['/usr/share', '/usr/local/share']) {
  const issues = [];
  const paths = layout(settings);
  const selected = Object.keys(config.browsers).filter(name => installed.has(config.browsers[name].appId));
  if (!selected.length) return {selected, issues: ['No supported browser Flatpaks are installed']};
  const checkFile = (label, filename, mode, source) => {
    try {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
      if ((stat.mode & 0o777) !== mode) issues.push(`${label}: expected permissions ${mode.toString(8)}: ${filename}`);
      if (source && !fs.readFileSync(filename).equals(fs.readFileSync(source))) {
        issues.push(`${label}: differs from current installer: ${filename}`);
      }
    }
    catch (err) { issues.push(`${label}: ${err.code === 'ENOENT' ? 'missing' : err.message}: ${filename}`); }
  };
  const checkManifest = (label, filename, expected) => {
    checkFile(label, filename, 0o600);
    try {
      const actual = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push(`${label}: content differs from expected manifest: ${filename}`);
    }
    catch (err) { if (err.code !== 'ENOENT') issues.push(`${label}: invalid JSON: ${filename}`); }
  };

  for (const name of ['host.js', 'messaging.js', 'config.js']) {
    checkFile(`Host ${name}`, path.join(paths.appDir, name), 0o600, path.join(__dirname, name));
  }
  checkFile('Host runner', paths.runPath, 0o700);
  try {
    const run = fs.readFileSync(paths.runPath, 'utf8');
    const match = run.match(/^#!\/bin\/sh\nset -eu\nexec '([^']+)' "\$\(dirname -- "\$0"\)\/host\.js" "\$@"\n$/);
    if (!match || !fs.existsSync(match[1])) issues.push(`Host runner: invalid script or Node.js path: ${paths.runPath}`);
  }
  catch (err) { if (err.code !== 'ENOENT') issues.push(`Host runner: ${err.message}`); }

  const byMode = {chromium: [], mozilla: []};
  for (const name of selected) {
    const browser = config.browsers[name];
    const extensions = config.extensionsForBrowser(name);
    byMode[browser.mode].push(...extensions);
    const shim = path.join(paths.frontends[name], `${config.name}-proxy-shim`);
    checkFile(`${name} shim`, shim, 0o700, path.join(__dirname, 'native-messaging-proxy-shim'));
    checkManifest(`${name} frontend`, path.join(paths.frontends[name], `${config.name}.json`),
      manifest(browser.mode, shim, extensions));
    if (!hasPermission(browser.appId, config.proxy.busName)) {
      issues.push(`${name}: missing ${config.proxy.busName} talk permission; run flatpak override --user --talk-name=${config.proxy.busName} ${browser.appId}`);
    }
  }
  for (const [mode, extensions] of Object.entries(byMode)) {
    if (extensions.length) checkManifest(`${mode} proxy`, path.join(paths.hosts[mode], `${config.name}.json`),
      manifest(mode, paths.runPath, extensions));
  }
  const service = 'dbus-1/services/org.freedesktop.NativeMessagingProxy.service';
  if (!serviceRoots.some(dir => fs.existsSync(path.join(dir, service)))) {
    issues.push('NativeMessagingProxy D-Bus activation service is missing');
  }
  return {selected, issues};
}

function flatpak(args) {
  const result = spawnSync('/usr/bin/flatpak', args, {encoding: 'utf8'});
  if (result.error || result.status !== 0) throw new Error(`flatpak ${args.join(' ')} failed: ${result.error?.message || result.stderr.trim()}`);
  return result.stdout;
}

function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('The included proxy shim requires x86-64 Linux');
  const installed = new Set(flatpak(['list', '--app', '--columns=application']).split('\n').map(s => s.trim()).filter(Boolean));
  const result = verify(options(process.argv.slice(2), process.env.HOME), installed, (appId, busName) => {
    const permissions = spawnSync('/usr/bin/flatpak', ['info', '--show-permissions', appId], {encoding: 'utf8'});
    return permissions.status === 0 && permissions.stdout.split('\n').includes(`${busName}=talk`);
  });
  console.log(`Checked ${result.selected.length} supported installed browser(s): ${result.selected.join(', ') || 'none'}`);
  for (const issue of result.issues) console.error(`FAIL: ${issue}`);
  if (result.issues.length) {
    console.error(`${result.issues.length} issue(s) found. Re-run ./install.sh with the same options after fixing prerequisites.`);
    process.exitCode = 1;
  }
  else console.log('Bridge files, manifests, permissions and proxy activation service are present.');
  console.log('Browser extensions and live link opening require a manual browser check.');
}

if (require.main === module) {
  try { main(); }
  catch (err) { console.error(`Verification failed: ${err.message}`); process.exitCode = 1; }
}
module.exports = {verify};

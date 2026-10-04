'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../app/config');
const {install} = require('../app/install');
const {verify} = require('../app/verify');

test('verifier checks each installed browser and reports damaged bridge files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xnmp-verify-'));
  try {
    const settings = {home, share: path.join(home, '.config')};
    const ids = new Set([config.browsers.firefox.appId, config.browsers.edge.appId]);
    const {paths} = install(settings, ids);
    const service = path.join(home, 'dbus-1/services');
    fs.mkdirSync(service, {recursive: true});
    fs.writeFileSync(path.join(service, 'org.freedesktop.NativeMessagingProxy.service'), '');
    const check = permission => verify(settings, ids, permission, [home]);
    assert.deepEqual(check(() => true).issues, []);
    fs.writeFileSync(path.join(paths.frontends.edge, `${config.name}.json`), '{}');
    fs.rmSync(path.join(paths.frontends.firefox, `${config.name}-proxy-shim`));
    const issues = check(id => id !== config.browsers.edge.appId).issues.join('\n');
    assert.match(issues, /edge frontend: content differs/);
    assert.match(issues, /firefox shim: missing/);
    assert.match(issues, /edge: missing .* talk permission/);
  }
  finally { fs.rmSync(home, {recursive: true, force: true}); }
});

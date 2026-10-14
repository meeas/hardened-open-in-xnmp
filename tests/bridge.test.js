'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {Readable, Writable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {spawnSync} = require('node:child_process');
const config = require('../app/config');
const host = require('../app/host');
const {Input, Output, Transform} = require('../app/messaging');
const {install} = require('../app/install');
const {uninstall} = require('../app/uninstall');
const {options, layout} = require('../app/installation');
const root = path.join(__dirname, '..');

const request = (target, args = ['https://example.com/a?x=1&y=2']) => ({
  cmd: 'exec', command: config.browsers[target].command, arguments: args, properties: {}
});
const argv = extension => extension.store === 'firefox' ?
  ['/tmp/com.add0n.node.json', extension.id] : [config.identity(extension)];
function frame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
}
async function decode(chunks, limit) {
  const result = [];
  await pipeline(Readable.from(chunks), new Input({maxMessageBytes: limit}),
    new Writable({objectMode: true, write(value, encoding, done) { result.push(value); done(); }}));
  return result;
}

for (const extension of config.extensions) {
  test(`${extension.store}: Open in ${extension.target} maps only to its fixed target`, () => {
    const id = host.determineNativeExtension(argv(extension));
    assert.equal(id, extension.id);
    assert.equal(host.validateRequest(id, request(extension.target)).targetFlatpak,
      config.browsers[extension.target].appId);
    for (const target of Object.keys(config.browsers)) {
      if (target !== extension.target) assert.throws(() => host.validateRequest(id, request(target)));
    }
  });
}

test('reject unauthorized identities, malformed origins and extra argv', () => {
  const origin = config.identity(config.extensions[0]);
  for (const args of [[], [origin + 'extra'], [origin.slice(0, -1)], [origin, 'extra'],
    ['chrome-extension://bifmfjgpgndemajpeeoiopbeilbaifdo/'],
    ['relative/com.add0n.node.json', config.extensions.at(-1).id],
    ['/tmp/other.json', config.extensions.at(-1).id],
    [config.extensions.at(-1).id]]) assert.throws(() => host.determineNativeExtension(args));
  assert.throws(() => host.validateRequest('__proto__', request('chrome')));
});

test('HTTP/HTTPS only; reject flags, controls, malformed URLs and excess arguments', () => {
  const id = config.extensions[0].id;
  for (const url of ['http://example.com', 'https://example.com', 'HTTPS://example.com/%20']) {
    assert.equal(host.validateUrl(url), url);
  }
  for (const url of ['', '--private-window', 'file:///etc/passwd', 'data:text/plain,a',
    'javascript:alert(1)', 'ftp://example.com', 'https:', 'https:example.com',
    ' https://example.com', 'https://example.com/\n', 'https://example.com/\t',
    'https://', 12, null, 'https://example.com/' + 'a'.repeat(16384)]) {
    assert.throws(() => host.validateUrl(url));
  }
  assert.throws(() => host.validateRequest(id, request('firefox', [])));
  assert.throws(() => host.validateRequest(id, request('firefox', Array(257).fill('https://example.com'))));
});

test('reject malformed requests and all extra capability-bearing fields', () => {
  const id = config.extensions[0].id;
  for (const msg of [null, 1, [], {}, {cmd: 'env'}, {cmd: 'spawn'},
    {...request('firefox'), command: '/usr/bin/firefox'},
    {...request('firefox'), properties: {shell: true}},
    {...request('firefox'), properties: null}]) assert.throws(() => host.validateRequest(id, msg));
  for (const key of ['env', 'stdin', 'kill', 'unref', 'script', 'permissions', 'uuid', 'data', 'unknown']) {
    assert.throws(() => host.validateRequest(id, {...request('firefox'), [key]: 'x'}));
  }
});

test('framing supports fragmented headers/payloads, multiple messages and output round trips', async () => {
  const messages = [request('firefox'), request('edge', ['https://example.com/é'])];
  const bytes = Buffer.concat(messages.map(frame));
  assert.deepEqual(await decode([...bytes].map(byte => Buffer.from([byte]))), messages);
  assert.deepEqual(await decode([bytes]), messages);
  const chunks = [];
  await pipeline(Readable.from(messages), new Output(),
    new Writable({write(chunk, encoding, done) { chunks.push(chunk); done(); }}));
  assert.deepEqual(await decode(chunks), messages);
});

test('framing rejects zero/oversized lengths, partial messages, invalid JSON/types/UTF-8', async () => {
  for (const bytes of [Buffer.from([0, 0, 0, 0]), Buffer.from([255, 255, 255, 255]),
    Buffer.from([1, 0]), Buffer.from([10, 0, 0, 0, 123]),
    Buffer.from([1, 0, 0, 0, 123]), Buffer.from([1, 0, 0, 0, 255]),
    frame(null), frame([]), frame('hello')]) await assert.rejects(decode([bytes]));
});

test('spawn uses fixed Flatpak, exact URL arguments, no shell and a reduced environment', async () => {
  for (const extension of config.extensions) {
    const calls = [];
    const spawn = (...args) => {
      calls.push(args);
      const child = new EventEmitter(); child.unref = () => {};
      process.nextTick(() => child.emit('spawn'));
      return child;
    };
    const replies = [];
    const url = 'https://example.com/?text=$(touch%20/tmp/unwanted);x=1&y=2';
    await pipeline(Readable.from([request(extension.target, [url])]),
      new Transform(host.observeForExtension(extension.id, spawn)),
      new Writable({objectMode: true, write(msg, encoding, done) { replies.push(msg); done(); }}));
    assert.equal(calls.length, 1);
    const [file, args, settings] = calls[0];
    assert.equal(file, '/usr/bin/flatpak');
    assert.deepEqual(args, ['run', config.browsers[extension.target].appId, url]);
    assert.equal(settings.shell, false);
    assert.equal(settings.stdio, 'ignore');
    assert.equal(settings.env.PATH, '/usr/bin:/bin');
    assert.equal(settings.env.NODE_OPTIONS, undefined);
    assert.equal(settings.env.LD_PRELOAD, undefined);
    assert.equal(replies[0].code, 0);
  }
});

test('spawn errors report failure; rejected requests never spawn', async () => {
  const extension = config.extensions[0];
  let calls = 0;
  const spawn = () => {
    calls++;
    const child = new EventEmitter();
    process.nextTick(() => child.emit('error', new Error('ENOENT')));
    return child;
  };
  const handler = host.observeForExtension(extension.id, spawn);
  const responses = [];
  await new Promise(resolve => handler(request('firefox'), x => responses.push(x), resolve));
  assert.equal(responses[0].code, 1007);
  await new Promise(resolve => handler(request('edge'), x => responses.push(x), resolve));
  assert.equal(calls, 1);
  assert.equal(responses[1].code, 126);
});

test('compiled shim and generated header agree with registry and reject other callers', () => {
  const generated = spawnSync(process.execPath, ['scripts/generate-shim-allowlist.js', '--check'], {cwd: root});
  assert.equal(generated.status, 0, generated.stderr.toString());
  const shim = path.join(root, 'app/native-messaging-proxy-shim');
  // A deliberately nonexistent bus avoids starting the proxy or any browser.
  const env = {...process.env, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent/xnmp-test-bus'};
  for (const extension of config.extensions) {
    const result = spawnSync(shim, argv(extension), {env, encoding: 'utf8'});
    assert.equal(result.status, 1, `${extension.id}: ${result.stderr}`);
    assert.match(result.stderr, /cannot connect to the session D-Bus/);
    assert.equal(result.stdout, '');
  }
  for (const args of [[], ['chrome-extension://bifmfjgpgndemajpeeoiopbeilbaifdo/'],
    ['relative/com.add0n.node.json', config.extensions.at(-1).id],
    [...argv(config.extensions[0]), 'extra']]) {
    assert.equal(spawnSync(shim, args, {env}).status, 64);
  }
});

test('installer works with every single browser, then uninstalls without touching other hosts', () => {
  for (const name of Object.keys(config.browsers)) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xnmp-test-'));
    try {
      const settings = {home, share: path.join(home, "custom directory's")};
      const browser = config.browsers[name];
      const {selected, paths} = install(settings, new Set([browser.appId]));
      assert.deepEqual(selected, [name]);
      const frontendPath = path.join(paths.frontends[name], 'com.add0n.node.json');
      const frontend = JSON.parse(fs.readFileSync(frontendPath));
      const hostManifest = JSON.parse(fs.readFileSync(path.join(paths.hosts[browser.mode], 'com.add0n.node.json')));
      const key = browser.mode === 'mozilla' ? 'allowed_extensions' : 'allowed_origins';
      assert.deepEqual(frontend[key], config.extensionsForBrowser(name).map(config.identity));
      assert.deepEqual(hostManifest[key], frontend[key]);
      assert.equal(hostManifest.path, paths.runPath);
      assert.equal(fs.statSync(frontendPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(frontend.path).mode & 0o777, 0o700);
      // Execute only a rejected request to validate generated shell quoting and Node selection.
      const extension = config.extensionsForBrowser(name)[0];
      const run = spawnSync(paths.runPath, argv(extension), {input: frame({cmd: 'env'})});
      assert.ifError(run.error);
      assert.equal(run.status, 0, run.stderr.toString());
      assert.equal(JSON.parse(run.stdout.subarray(4)).code, 126);
      const unrelated = path.join(paths.frontends[name], 'unrelated.json');
      fs.writeFileSync(unrelated, '{}');
      uninstall(settings);
      uninstall(settings); // Idempotent cleanup.
      assert.equal(fs.existsSync(frontendPath), false);
      assert.equal(fs.existsSync(paths.appDir), false);
      assert.equal(fs.existsSync(unrelated), true);
    }
    finally { fs.rmSync(home, {recursive: true, force: true}); }
  }
});

test('all-browser broker manifests authorize the union of source manifests', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xnmp-test-'));
  try {
    const settings = options([], home);
    const {paths} = install(settings, new Set(Object.values(config.browsers).map(b => b.appId)));
    for (const mode of ['chromium', 'mozilla']) {
      const m = JSON.parse(fs.readFileSync(path.join(paths.hosts[mode], 'com.add0n.node.json')));
      assert.deepEqual(new Set(m[mode === 'mozilla' ? 'allowed_extensions' : 'allowed_origins']),
        new Set(config.extensions.filter(e => (e.store === 'firefox') === (mode === 'mozilla')).map(config.identity)));
    }
    uninstall(settings);
    for (const dir of Object.values(paths.frontends)) assert.equal(fs.existsSync(path.join(dir, 'com.add0n.node-proxy-shim')), false);
  }
  finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('installer preserves an explicit Node executable path in run.sh', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xnmp-test-'));
  try {
    const nodePath = path.join(home, 'node');
    fs.symlinkSync(process.execPath, nodePath);
    const settings = options([], home);
    const {paths} = install(settings, new Set([config.browsers.chrome.appId]), nodePath);
    const run = fs.readFileSync(paths.runPath, 'utf8');
    assert.ok(run.includes(`exec '${nodePath}' `));
    assert.ok(fs.existsSync(nodePath));
    uninstall(settings);
  }
  finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('no browsers and invalid installer options fail before writing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xnmp-test-'));
  try {
    assert.throws(() => install(options([], home), new Set()));
    assert.deepEqual(fs.readdirSync(home), []);
    for (const args of [['--custom-dir='], ['--anything'], ['--custom-dir=a', '--custom-dir=b']]) {
      assert.throws(() => options(args, home));
    }
    assert.equal(layout(options(['--custom-dir=~/bridge'], home)).appDir, path.join(home, 'bridge/com.add0n.node'));
  }
  finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('README direction/store matrix matches frontend authorization', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const columns = ['chrome', 'firefox', 'edge', 'brave', 'chromium', 'opera', 'vivaldi'];
  const storeLetter = {chrome: 'C', firefox: 'F', edge: 'E', opera: 'O'};
  for (const name of columns) {
    const row = readme.split('\n').find(line => line.toLowerCase().startsWith(`| ${name} |`));
    assert.ok(row, `Missing source row: ${name}`);
    const cells = row.split('|').slice(2, -1).map(cell => cell.trim());
    assert.equal(cells.length, columns.length);
    columns.forEach((target, index) => {
      const stores = config.extensionsForBrowser(name).filter(e => e.target === target).map(e => storeLetter[e.store]);
      assert.deepEqual(cells[index] === '—' ? [] : cells[index].split('/').sort(), stores.sort(), `${name} → ${target}`);
    });
  }
});

test('host CLI rejects partial frames without payload leakage or corrupt stdout', () => {
  for (const input of [Buffer.from([20, 0, 0, 0, 123]), frame(null),
    Buffer.concat([Buffer.from([6, 0, 0, 0]), Buffer.from('secret')])]) {
    const result = spawnSync(process.execPath,
      [path.join(root, 'app/host.js'), ...argv(config.extensions[0])], {input});
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.toString(), 'com.add0n.node: native messaging stream failed\n');
  }
});

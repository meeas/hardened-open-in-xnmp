'use strict';

const path = require('path');
const {spawn} = require('child_process');
const config = require('./config');

function failure(code, error) {
  return {code, stdout: '', stderr: error, error};
}

function validateUrl(value) {
  if (typeof value !== 'string') {
    throw new Error('All arguments must be URL strings');
  }
  if (value.length === 0 || value.length > config.security.maxUrlLength) {
    throw new Error('URL length is outside the permitted range');
  }
  if (/[\0\r\n]/.test(value)) {
    throw new Error('URL contains prohibited control characters');
  }

  let parsed;
  try {
    parsed = new URL(value);
  }
  catch {
    throw new Error('Argument is not a valid absolute URL');
  }

  if (!config.security.allowedSchemes.includes(parsed.protocol)) {
    throw new Error(`URL scheme "${parsed.protocol}" is not permitted`);
  }
  return value;
}

function determineNativeSource(argv) {
  // xdg-native-messaging-proxy mirrors browser-native argv semantics:
  // Chromium: <host> <chrome-extension://origin/>
  // Mozilla:  <host> <manifest-path> <extension-id>
  if (argv.length === 1 && argv[0] === config.sources.chrome.origin) {
    return 'chrome';
  }

  if (
    argv.length === 2 &&
    typeof argv[0] === 'string' &&
    path.isAbsolute(argv[0]) &&
    path.basename(argv[0]) === `${config.name}.json` &&
    argv[1] === config.sources.firefox.extensionId
  ) {
    return 'firefox';
  }

  throw new Error('Refusing unexpected native-messaging caller identity');
}

function validateRequest(sourceName, msg) {
  const source = config.sources[sourceName];
  if (!source) {
    throw new Error('Invalid native-host source');
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    throw new Error('Native message must be a JSON object');
  }

  // Upstream Open in Firefox / Open in Chrome use cmd=exec on Linux.
  if (msg.cmd !== 'exec') {
    throw new Error(`Unsupported native command: ${String(msg.cmd)}`);
  }

  // Verify the genuine extension's default Linux command, but never execute it.
  if (msg.command !== source.expectedCommand) {
    throw new Error(`Unexpected target command: ${String(msg.command)}`);
  }

  // Do not accept Node child_process options such as shell/env/detached/stdio.
  if (msg.properties !== undefined) {
    if (!msg.properties || typeof msg.properties !== 'object' || Array.isArray(msg.properties)) {
      throw new Error('Invalid process properties');
    }
    if (Object.keys(msg.properties).length !== 0) {
      throw new Error('Process properties are not permitted');
    }
  }

  const args = msg.arguments;
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('At least one URL is required');
  }
  if (args.length > config.security.maxUrls) {
    throw new Error(`Too many URLs; maximum is ${config.security.maxUrls}`);
  }

  const urls = args.map(validateUrl);

  // Explicitly reject capability-bearing fields from the generic upstream bridge.
  for (const key of ['env', 'stdin', 'kill', 'unref', 'script', 'permissions', 'uuid', 'data']) {
    if (Object.prototype.hasOwnProperty.call(msg, key)) {
      throw new Error(`Native field "${key}" is not permitted`);
    }
  }

  return {targetFlatpak: source.targetFlatpak, urls};
}

function sanitizedLaunchEnv() {
  // Pass only variables needed for Flatpak/session integration. Do not expose
  // arbitrary secrets from the native host environment to child processes.
  const allowed = [
    'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE',
    'XDG_RUNTIME_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_DIRS',
    'DBUS_SESSION_BUS_ADDRESS', 'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY',
    'DESKTOP_STARTUP_ID'
  ];
  const env = {PATH: '/usr/bin:/bin'};
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
}

function launch(targetFlatpak, urls, push, done) {
  const child = spawn('/usr/bin/flatpak', ['run', targetFlatpak, ...urls], {
    detached: true,
    stdio: 'ignore',
    shell: false,
    env: sanitizedLaunchEnv()
  });

  let finished = false;
  const finish = response => {
    if (finished) return;
    finished = true;
    push(response);
    done();
  };

  child.once('spawn', () => {
    child.unref();
    finish({code: 0, stdout: '', stderr: ''});
  });
  child.once('error', err => {
    finish(failure(1007, `Unable to launch target Flatpak: ${err.message}`));
  });
}

function observeForSource(sourceName) {
  return (msg, push, done) => {
    try {
      const request = validateRequest(sourceName, msg);
      launch(request.targetFlatpak, request.urls, push, done);
    }
    catch (err) {
      push(failure(126, err.message));
      done();
    }
  };
}

function main() {
  let sourceName;
  try {
    sourceName = determineNativeSource(process.argv.slice(2));
  }
  catch (err) {
    process.stderr.write(`com.add0n.node: ${err.message}\n`);
    process.exit(64);
  }

  const {Input, Transform, Output} = require('./messaging');
  process.stdin
    .pipe(new Input({maxMessageBytes: config.security.maxMessageBytes}))
    .pipe(new Transform(observeForSource(sourceName)))
    .pipe(new Output())
    .pipe(process.stdout);
}

if (require.main === module) main();

module.exports = {determineNativeSource, validateRequest, validateUrl, observeForSource};

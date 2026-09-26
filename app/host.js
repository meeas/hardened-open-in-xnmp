'use strict';

const path = require('path');
const {spawn} = require('child_process');
const config = require('./config');

function failure(code, error) {
  return {code, stdout: '', stderr: error, error};
}

/** Return an unchanged absolute HTTP(S) URL or throw; no raw ASCII whitespace,
 * control characters, other schemes or command-line flags are accepted.
 */
function validateUrl(value) {
  if (typeof value !== 'string') {
    throw new Error('All arguments must be URL strings');
  }
  if (value.length === 0 || value.length > config.security.maxUrlLength) {
    throw new Error('URL length is outside the permitted range');
  }
  if (/[\x00-\x20\x7f]/.test(value) || !/^https?:\/\//i.test(value)) {
    throw new Error('URL must start with http:// or https:// and contain no whitespace/control characters');
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

/** Resolve native argv to a registry identity; never infer a physical source browser.
 * Chromium forks use identical origin arguments. The returned ID grants only the
 * extension's fixed destination capability. Unexpected arguments throw.
 */
function determineNativeExtension(argv) {
  let identity;
  let mozilla = false;
  if (argv.length === 1) identity = argv[0];
  else if (argv.length === 2 && typeof argv[0] === 'string' &&
    path.isAbsolute(argv[0]) && path.basename(argv[0]) === `${config.name}.json`) {
    identity = argv[1];
    mozilla = true;
  }
  const extension = config.extensions.find(e =>
    (e.store === 'firefox') === mozilla && config.identity(e) === identity);
  if (!extension) throw new Error('Refusing unexpected native-messaging caller identity');
  return extension.id;
}

/** Validate an upstream Linux exec request for an allowlisted extension ID.
 * Returns trusted targetFlatpak plus URL arguments; throws before any execution.
 */
function validateRequest(extensionId, msg) {
  const extension = config.extensions.find(e => e.id === extensionId);
  if (!extension) throw new Error('Invalid native-host extension');
  const target = config.browsers[extension.target];
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    throw new Error('Native message must be a JSON object');
  }

  // Supported upstream Open-in extensions use cmd=exec on Linux.
  if (msg.cmd !== 'exec') {
    throw new Error(`Unsupported native command: ${String(msg.cmd)}`);
  }

  // Verify the genuine extension's default Linux command, but never execute it.
  if (msg.command !== target.command) {
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

  const fields = new Set(['cmd', 'command', 'arguments', 'properties']);
  for (const key of Object.keys(msg)) {
    if (!fields.has(key)) throw new Error(`Native field "${key}" is not permitted`);
  }

  return {targetFlatpak: target.appId, urls};
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

/** Acknowledge Flatpak process creation once; later exits are not observed.
 * Detachment lets the destination survive closure of the native-messaging port.
 */
function launch(targetFlatpak, urls, push, done, spawnProcess) {
  const child = spawnProcess('/usr/bin/flatpak', ['run', targetFlatpak, ...urls], {
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

/** Build a request handler. spawnProcess is injectable for browser-free tests. */
function observeForExtension(extensionId, spawnProcess = spawn) {
  return (msg, push, done) => {
    try {
      const request = validateRequest(extensionId, msg);
      launch(request.targetFlatpak, request.urls, push, done, spawnProcess);
    }
    catch (err) {
      push(failure(126, err.message));
      done();
    }
  };
}

function main() {
  let extensionId;
  try {
    extensionId = determineNativeExtension(process.argv.slice(2));
  }
  catch (err) {
    process.stderr.write(`com.add0n.node: ${err.message}\n`);
    process.exit(64);
  }

  const {Input, Transform, Output} = require('./messaging');
  require('stream').pipeline(
    process.stdin,
    new Input({maxMessageBytes: config.security.maxMessageBytes}),
    new Transform(observeForExtension(extensionId)),
    new Output(),
    process.stdout,
    err => {
      if (err) {
        // JSON parse errors may contain URL data; do not echo their text.
        process.stderr.write('com.add0n.node: native messaging stream failed\n');
        process.exitCode = 1;
      }
    }
  );
}

if (require.main === module) main();

module.exports = {determineNativeExtension, validateRequest, validateUrl, observeForExtension};

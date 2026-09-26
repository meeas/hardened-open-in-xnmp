## Project Context

This project is a hardened implementation of the `com.add0n.node` native-messaging host used by browser extensions such as “Open in Chrome” and “Open in Firefox.”

The implementation is written in Node.js and runs on the Linux host.

Its purpose is to provide the browser extension with the very limited capability required to open an HTTP or HTTPS URL in another explicitly supported browser.

The design should remain small, auditable, and narrowly scoped.

## Primary Components

The host-side implementation consists approximately of:

- `run.sh`
- `host.js`
- `messaging.js`

Responsibilities should remain separated where practical:

### `run.sh`

Responsible for launching the native-messaging host.

It should invoke the intended Node.js application directly and should not perform arbitrary command interpretation.

### `host.js`

Responsible for the application logic, including:

- receiving parsed native-messaging requests;
- validating requests;
- validating URLs;
- validating requested operations;
- selecting an explicitly supported destination browser;
- launching that browser safely;
- producing an appropriate native-messaging response;
- rejecting unauthorized or malformed requests.

### `messaging.js`

Responsible for the browser Native Messaging wire protocol, including:

- reading the 4-byte little-endian message length;
- reading the corresponding JSON payload;
- parsing incoming messages;
- serializing responses;
- writing the 4-byte little-endian response length;
- writing the JSON response.

Native Messaging protocol handling should remain separate from higher-level security and browser-launch logic.

## Security Model

The host is a security boundary.

Do not assume that requests arriving through Native Messaging are trustworthy merely because they came from a browser extension.

All security-sensitive validation must occur in the host.

The implementation must not become a generic command-execution mechanism.

Specifically, do not allow the extension to provide:

- arbitrary executable paths;
- arbitrary commands;
- shell fragments;
- arbitrary Flatpak application IDs;
- arbitrary URI schemes;
- arbitrary command-line arguments.

The application should expose capabilities rather than generic process execution.

For example, a request should conceptually mean:

`open this validated HTTPS URL in Chrome`

rather than:

`execute this supplied command with these supplied arguments`

## URL Validation

Only explicitly permitted URL schemes should be accepted.

Currently permitted:

- `http://`
- `https://`

Reject other schemes unless they are deliberately added later.

Examples that should not automatically be accepted include:

- `file://`
- `javascript:`
- `data:`
- `ssh:`
- `ftp:`
- custom application schemes

URLs should be parsed using a real URL parser rather than validated with fragile string matching.

Malformed URLs should fail closed.

## Browser Allowlist

Destination browsers must come from a fixed internal allowlist.

Current intended browser mappings include:

- Firefox Flatpak: `org.mozilla.firefox`
- Google Chrome Flatpak: `com.google.Chrome`

The extension must not be permitted to provide an arbitrary Flatpak application ID.

The host should translate a small logical browser identifier into a predetermined application/command internally.

For example:

`chrome`

may internally resolve to:

`/usr/bin/flatpak run com.google.Chrome <validated URL>`

The executable path and application ID should originate from trusted application configuration/code, not from the Native Messaging request.

## Process Execution

Do not use a shell to launch browsers.

Prefer Node.js process APIs such as `spawn()` or `execFile()` with a fixed executable and an explicit argument array.

Avoid constructs equivalent to:

`sh -c "...user controlled data..."`

A validated URL should be passed as an individual argument, not interpolated into a command string.

The implementation should also avoid inheriting unnecessary execution capabilities or environment-dependent behavior.

## Native Messaging Protocol

The application communicates using the standard browser Native Messaging protocol over stdin/stdout.

Each message consists of:

1. a 4-byte unsigned little-endian length;
2. exactly that many bytes of UTF-8 JSON.

Responses use the same framing.

### stdout requirements

`stdout` is protocol-only.

Never write:

- debug messages;
- logging;
- stack traces;
- status text;
- startup banners

to stdout.

Anything written there can corrupt the Native Messaging stream.

Diagnostics should go to `stderr` or another deliberately configured logging destination.

## Input Hardening

Treat stdin as untrusted input.

The implementation should defensively handle:

- malformed length fields;
- zero-length messages where inappropriate;
- oversized messages;
- truncated messages;
- malformed JSON;
- unexpected JSON types;
- missing required fields;
- unknown operations;
- unexpected properties where strict validation is appropriate.

Define a conservative maximum message size.

Do not allocate arbitrarily large buffers based solely on a client-provided length prefix.

Malformed requests should fail closed without causing the host to execute anything.

## Extension Authorization

Native Messaging manifests should restrict access to the intended browser extensions.

Known extension identities include:

Chrome extension ID:

`lmeddoobegbaiopohmpmmobpnpjifpii`

Firefox extension ID:

`{086f665e-6a55-4107-9147-f9a14e72b137}`

Do not broaden the manifests to arbitrary extensions unless explicitly requested.

Where practical, retain defense in depth so that the host does not depend exclusively upon manifest-level authorization for its security.

## Firefox Integration

Firefox supports communicating with host-side native-messaging applications through `xdg-native-messaging-proxy`.

The intended path is:

Firefox
→ Native Messaging API
→ `org.freedesktop.NativeMessagingProxy`
→ `xdg-native-messaging-proxy`
→ host-side `com.add0n.node` manifest
→ this Node.js host
→ destination browser

The host implementation itself should not contain Firefox-specific proxy logic.

From the host application's perspective, it should remain a normal standards-compliant Native Messaging host.

This separation is intentional.

## Native Messaging Manifest

The host should have an appropriate `com.add0n.node` Native Messaging manifest installed in a host-visible native-messaging location.

The manifest should:

- use the name `com.add0n.node`;
- reference the trusted launcher for this project;
- identify the intended extension origins/IDs;
- not expose the host to arbitrary browser extensions.

Keep platform/browser differences in manifest generation or installation logic rather than embedding them into the Node.js application wherever possible.

## Failure Behavior

Prefer explicit failure over permissive fallback.

Examples:

- Unknown browser → reject.
- Unknown operation → reject.
- Invalid URL → reject.
- Unsupported URL scheme → reject.
- Malformed JSON → reject.
- Missing required property → reject.
- Browser launch failure → report failure without attempting arbitrary alternatives.

Do not silently reinterpret malformed input into something executable.

## Logging

Logging must never interfere with Native Messaging framing.

Use stderr for development diagnostics.

Avoid logging sensitive browser data unnecessarily.

If URLs are logged, consider that URLs can contain:

- authentication tokens;
- session identifiers;
- query parameters;
- private resource names.

Production logging should therefore be minimal.

## Development Priorities

When modifying or refactoring the project, prioritize:

1. Security.
2. Correct Native Messaging protocol handling.
3. Preservation of current working behavior.
4. Small and auditable attack surface.
5. Strict input validation.
6. Fixed allowlists rather than arbitrary execution.
7. Separation of protocol handling from application logic.
8. Clear error handling.
9. Minimal dependencies.
10. Maintainability and testability.

Do not trade away the narrowly constrained security model merely to simplify the code.

## Testing Expectations

Tests should cover at least:

- valid HTTP URL;
- valid HTTPS URL;
- malformed URL;
- prohibited URI scheme;
- supported destination browser;
- unsupported destination browser;
- valid Native Messaging framing;
- fragmented stdin reads;
- multiple messages where supported;
- malformed JSON;
- incomplete message;
- oversized declared message;
- unknown operation;
- missing required fields;
- browser process launch failure.

Where practical, process-launch tests should mock the execution layer so tests cannot accidentally launch real browsers.

Security-relevant parsing and validation behavior should have explicit regression tests.

## Overall Design Principle

Treat this project as a narrowly scoped security broker.

Its responsibility is:

**accept a tightly defined Native Messaging request, validate it, and perform one explicitly permitted browser-opening operation.**

It is not a general-purpose Native Messaging runtime, shell bridge, Flatpak launcher, or arbitrary process-execution service.
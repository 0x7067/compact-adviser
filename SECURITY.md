# Security and verification boundaries

## Conversation data

The Pi extension sends selected conversation text to TypeSafe only after explicit saved consent and with a key supplied by the launch environment.
It never writes the key into settings or session entries.
Redaction is best-effort, not a guarantee; do not enable sharing for material that must not leave the machine.
The fixed HTTPS endpoint rejects redirects, requests and responses are bounded, and errors never substitute an affirmative judgment.

Automatic compaction is experimental and lossy.
A high model probability is not proof of preservation or continuation quality.
Hint mode is the default; the normal Pi compaction path and other extensions' hooks remain authoritative.

## Package separation

The Pi implementation lives only in `packages/pi-extension` and owns its Pi-specific configuration and session entries.
The reserved `packages/claude-mod` contains no runtime or hooks.
A future Claude implementation must use separate installation and mutable storage.

## Accepted development-only dependency hygiene item

The development SDK is pinned to **Pi 0.82.0**, matching the installed runtime compatibility target.
At verification on 2026-09-17, `npm audit` reported bundled transitive findings for `undici` 8.5.0 and `brace-expansion` 5.0.7, plus the parent Pi SDK roll-up.
They are in the development SDK tree, not in compact-adviser's additional runtime dependency (`proper-lockfile`).
The user's Pi provides the core modules at runtime; this repository does not bundle or update that shared installation.

Overriding/reinstalling and targeted npm updates did not replace the SDK's bundled dependency tree.
The deliberate accepted choice was to retain exact API parity for development rather than silently typecheck against newer-only APIs or update a shared Pi installation.
Ineffective overrides were removed.
This does not imply that a user's own Pi installation is free of those advisories; it is independently managed.

Install runtime dependencies with `--omit=dev --omit=peer` when using Pi's bundled modules.
Development dependencies can be revisited when upgrading the supported API baseline, with real-runtime compatibility tests kept green.

## Tests versus model accuracy

The native integration tests use the real Pi executable, an isolated agent directory and transcript, and deterministic provider and TypeSafe fixtures.
They prove API/UI integration, cancellation, and local safety conditions without exposing account credentials or conversation data.
They do not establish live Jev precision or continued task quality after a real generated summary.

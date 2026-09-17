# Security and verification boundaries

## Conversation data

The Pi extension sends selected conversation text to TypeSafe only after explicit saved consent and with a key supplied by the launch environment or by `TYPESAFE_API_KEY` in a `.env` file in the working directory when the launch environment does not set one.
It never writes the key into settings or session entries.
Redaction is best-effort, not a guarantee; do not enable sharing for material that must not leave the machine.
The fixed HTTPS endpoint rejects redirects, requests and responses are bounded, and errors never substitute an affirmative judgment.

Automatic compaction is experimental and lossy.
A high model probability is not proof of preservation or continuation quality.
Hint mode is the default; the normal Pi compaction path and other extensions' hooks remain authoritative.

## Package separation

The Pi implementation lives only in `packages/pi-extension` and owns its Pi-specific configuration and session entries.
The Claude Code implementation lives only in `packages/claude-mod` and owns its `userConfig` options and plugin store.
Neither loads the other's runtime or reads the other's storage.

## Claude Code mod

The mod applies the same conversation-data rules as the Pi extension: explicit saved consent, a key from Claude Code's launch environment or from `TYPESAFE_API_KEY` in a working-directory `.env` when the launch environment does not set one (never stored or displayed), best-effort redaction, a bounded request, and no affirmative judgment substituted for an error.
Requests go through Claude Code's host fetch (`$.http.fetch`), which does not expose redirect control to plugins; the fixed endpoint is `https://api.typesafe.ai/v1/systemone`.
The only endpoint override, `COMPACT_ADVISER_TEST_ENDPOINT`, exists for the live regression and is ignored unless it is an `http://127.0.0.1:<port>/` URL.
Consent and the automatic-mode acknowledgement are kept in the plugin's own store, not in `/config`, so they cannot be granted without the disclosure dialog.

The mods API is early access and default-off; the module is a complete no-op unless `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is exactly `1`.
Its development dependencies are TypeScript and Biome only; it has no runtime dependency.

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

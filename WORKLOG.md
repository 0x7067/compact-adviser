# Verification record

## Repository and scope

The repository is a monorepo: `packages/pi-extension` is independently installable; `packages/claude-mod` is an explicitly reserved, unimplemented sibling; `docs/product-contract.md` records shared semantics without shared runtime wiring or mutable state.
The root is not a Pi extension and has no host loader.
No shared/global Pi installation has been changed.

## Implemented

Persistent hint/auto/off preference, explicit TypeSafe sharing consent, constant configurable 40k minimum, native settings and direct commands, threshold-before-request gating, settled-exchange judgment, bounded typed requests, conservative auto checks, cancellation, deduplicated hints, snooze, per-branch cooldown persistence, and native compaction callbacks.

## Runtime evidence

Initial terminal tests exercised the pinned development SDK; npm prepends that binary to PATH.
The compatibility command now requires an explicit `COMPACT_TEST_PI_BIN` resolved before invoking npm.
It was then rerun against the actual signed launcher resolved by `command -v pi` before npm started, which reported version 0.82.0.
The real-runtime tests cover prefilled input and editing/reset, rendered hints from native settlement, programmatic native compaction with post-compaction unknown usage, and installation/loading through the Pi package's own manifest in an isolated agent directory.

A real TUI reproduction found that Pi 0.82's `ctx.ui.input` second argument is an ignored placeholder, not an initial value.
Pressing Enter on the proposed input returned an empty string.
The fix uses Pi's existing Input component through `ctx.ui.custom`, with `setValue`, native keybindings, focus propagation, and native styling.
The same real-terminal regression now passes with an untouched value, an edited value, and reset.
No custom settings framework was introduced.

The terminal test runner also needed bounded cleanup of its own child process to avoid waiting while an unread PTY blocked terminal shutdown.
It now closes only the test-created terminal/process and has bounded termination.

## Dependency choice

Retained the 0.82.0 development SDK for exact API fidelity.
Accepted development-only bundled audit findings are recorded in SECURITY.md; ineffective overrides were removed.
No newer-only SDK API or shared installation upgrade is used.

## Final verification (2026-09-17)

- `npm run check`: TypeScript and Biome clean; 20 behavioral tests passed.
- `COMPACT_TEST_PI_BIN="$(command -v pi)" npm run test:e2e`: four real signed-Pi 0.82.0 terminal tests passed.
- The installation test creates a production-only package with `npm ci --omit=dev --omit=peer --ignore-scripts`, proves no Pi development SDK was installed in that package, and successfully installs/loads it through its own manifest.
- `npm --prefix packages/pi-extension audit --omit=dev --omit=peer`: zero runtime-dependency vulnerabilities.
- No real user installation or settings were changed; test profiles, sessions, configuration, and child processes were isolated and test-owned.

## Remaining quality boundary

Live Jev compaction classification and real-summary continuation quality are not measured by fixture-based integration tests.
Automatic mode is explicitly experimental, opt-in, and conservative.

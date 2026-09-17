# Verification record

## Repository and scope

The repository is a monorepo: `packages/pi-extension` and `packages/claude-mod` are independently installable siblings; `docs/product-contract.md` records shared semantics without shared runtime wiring or mutable state.
The root is not a Pi extension and has no host loader.
No shared/global Pi installation has been changed.

## Implemented

Persistent hint/auto/off preference, install-as-consent TypeSafe sharing, constant configurable 40k minimum, native settings and direct commands, threshold-before-request gating, settled-exchange judgment, bounded typed requests, conservative auto checks, cancellation, deduplicated hints, snooze, per-branch cooldown persistence, and native compaction callbacks.

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

# Claude Code mod verification record

## Implemented

`packages/claude-mod` is a Claude Code plugin whose behavior is one function-hooks module (`hooks/register.ts`) over pure libraries in `lib/`.
It matches the Pi extension's semantics: hint default, explicit experimental auto with first-use confirmation, the constant configurable 40,000-token minimum, installing the package as TypeSafe sharing consent, a key only from the launch environment or cwd `.env`, the same Jev questions, validation, floors, cooldowns, bounded state, snooze and dismiss, and the same menu rows and commands.
Settings use Claude Code's `userConfig` options for mode and minimum and the plugin store for the automatic-mode acknowledgement and cooldowns.
It is inert unless `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is exactly `1`.

## Runtime findings on Claude Code 2.1.274

- The settings pane (`$.ui.open` with `Select`, a prefilled `Input`, and `Button` elements) works inline and docked, down to 70 columns in a spike.
- Saving a `userConfig` option hot-reloads the module and drops the old environment's later toasts, so save confirmations are handed to the reloaded environment through the plugin store.
- The host drops a plugin toast within two seconds of its previous one, so the pinned status line is the primary hint signal and automatic compaction is also recorded as a dim transcript line.
- The engine's question dialog takes the keyboard from an open pane and returns it to the prompt, so the pane re-requests focus after a confirmation.
- At session start `$.config.list()` can briefly omit the plugin's rows; the module falls back to the host-validated options it loaded with.
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` makes Claude Code refuse every plugin `$.http.fetch`; the mod names that cause instead of a generic network error.
- `$.session.compact` skips the calling plugin's own `session.compact` hook, so the automatic path resets its own cooldown.

## Final verification (2026-09-17)

- `npm --prefix packages/claude-mod run check`: plugin API declarations regenerated from the installed Claude Code, TypeScript and Biome clean, `claude plugin validate --strict` reports exactly the expected hooks and environment reads, and 60 behavioral tests pass under `claude plugin test`.
- `npm --prefix packages/claude-mod run test:e2e`: nine live checks pass in the real Claude Code 2.1.274 TUI under tmux, with an isolated configuration directory, a local stand-in for the Anthropic Messages API, and a local TypeSafe fixture; no real user configuration, credential, or model quota was used.

## Remaining quality boundary

Live Jev classification and continuation quality after a real summary were not measured for this package; the TypeSafe responses in every test are fixtures.
The skills-directory install path was not exercised; `--plugin-dir` was.
The mods API is early access and must be re-verified on each Claude Code release.

# Shared product contract

This is a documentation contract, not a shared runtime or install-state layer.
Each harness implementation owns its event handling, dependencies, installation, configuration location, and session state.

## Semantics

- Modes: `hint` (default), `auto` (explicit experimental opt-in), and `off`.
- Hint text: **Run /compact to save tokens.**
- `minContextTokens` defaults to the constant **40000**, is configurable and persists with the selected mode.
There is no percentage-of-context-window condition.
- A size threshold makes a checkpoint eligible for judgment; it does not order compaction.
- Inspect cheap local state before any TypeSafe Jev request.
- TypeSafe/Jev snapshots consider up to the last 64 transcript messages, including tool results, clipped by existing byte budgets (about 14kB recent tail, per-message caps, 8kB user-constraint budget, and a 32kB request refuse path). Message count is not the tight payload bottleneck.
- Long tool-result dumps keep a head and tail slice with an explicit middle omission marker so one result cannot consume the tail budget.
- Optional TypeSafe request logging is off by default and can be enabled from the compact-adviser settings menu. When on, each request body is appended to a local jsonl log with existing secret redaction and never the API key.
- Judge whether known next work can continue without exact older details, not whether context is merely large.
- A single question decides the hint: the phase completion probability must clear the mode floor. A companion question about whether older detail would be lost was measured against real sessions and removed, because it never prevented a bad hint, it cost good ones, and the phase answer did not change without it.
- Uncertain, stale, interrupted, or failed judgments leave context alone.
- Installing or loading the package is consent to send eligible checkpoint context to TypeSafe when a key is available and other product gates pass (mode, minimum context, idle session, and so on). Secrets are never settings values.
- There is no separate sharing toggle. A saved `sharingConsent` value from an older version is ignored.
- Native compaction remains authoritative and lossy; no timing model promises perfect preservation.
- Configuration changes do not immediately compact.
Invalid values and cancellation preserve existing settings; failed saves are reported.

## Implementations

| Package | State | Installation |
| --- | --- | --- |
| `packages/pi-extension` | Pi implementation | Install this package path with `pi install` |
| `packages/claude-mod` | Claude Code mod (early-access function-hooks API) | Load this package path with `claude --plugin-dir` and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` |

Pi uses its own agent-directory `compact-adviser.json` and Pi session custom entries.
The Claude Code mod uses its own `userConfig` options (`mode`, `minContextTokens`) in Claude Code's settings, and its own plugin store for the automatic-mode acknowledgement and per-session cooldowns.
Neither implementation reads or mutates the other's records.
No harness installs or loads the other harness's runtime.

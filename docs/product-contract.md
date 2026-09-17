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
- Judge whether known next work can continue without exact older details, not whether context is merely large.
- Uncertain, stale, interrupted, or failed judgments leave context alone.
- External conversation sharing requires explicit consent; secrets are never settings values.
- Native compaction remains authoritative and lossy; no timing model promises perfect preservation.
- Configuration changes do not immediately compact.
Invalid values and cancellation preserve existing settings; failed saves are reported.

## Implementations

| Package | State | Installation |
| --- | --- | --- |
| `packages/pi-extension` | Pi implementation | Install this package path with `pi install` |
| `packages/claude-mod` | Reserved, not implemented | No install command until a Claude-specific implementation exists |

Pi uses its own agent-directory `compact-adviser.json` and Pi session custom entries.
The future Claude implementation must use separate harness-owned storage and must not read or mutate those Pi records.
No harness installs or loads the other harness's runtime.

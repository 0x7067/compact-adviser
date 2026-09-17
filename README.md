# compact-adviser

Find a good checkpoint before compacting an AI coding session.

A small monorepo with independent implementations for each host:

| Package | Status | Install target |
| --- | --- | --- |
| [Pi extension](packages/pi-extension/README.md) | Implemented; automatic mode is experimental | `packages/pi-extension` |
| [Claude Code mod](packages/claude-mod/README.md) | Reserved for future implementation | Not installable yet |

There is no root runtime entry point.
Each package owns its dependencies, installation, and mutable configuration.
[Shared product semantics](docs/product-contract.md) are documentation, not a shared runtime.

## Pi quick start

From this repository's root:

```sh
npm --prefix packages/pi-extension ci --omit=dev --omit=peer --ignore-scripts
pi install "$PWD/packages/pi-extension"
```

Restart Pi or run `/reload`.
Use Pi 0.82.0 or newer; the actual 0.82.0 runtime is the verified compatibility target.

Launch Pi with `TYPESAFE_API_KEY` supplied by your usual secret manager, then run:

```text
/compact-adviser sharing on
/compact-adviser
```

The extension asks before sending selected conversation text to TypeSafe.
It defaults to hints, checks a **constant 40,000-token minimum** before requesting a judgment, and only judges settled exchanges.
Optional automatic compaction requires explicit enablement and remains experimental.
The selected mode and token minimum persist across sessions and projects.

See the [Pi guide](packages/pi-extension/README.md) for settings, commands, privacy, safety limits, and tests.

## Development

```sh
npm --prefix packages/pi-extension ci --ignore-scripts
npm run check
COMPACT_TEST_PI_BIN="$(command -v pi)" npm run test:e2e
```

Resolve the actual Pi executable **before** npm modifies PATH; the compatibility tests require Pi 0.82.0 and Python 3.
They use isolated configuration/session directories, a local deterministic model, and a mocked TypeSafe transport, not account credentials.

No hosted service or repository publication is needed.

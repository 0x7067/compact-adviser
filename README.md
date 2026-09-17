# compact-adviser

Find a good checkpoint before compacting an AI coding session.

A small monorepo with independent implementations for each host:

| Package | Status | Install target |
| --- | --- | --- |
| [Pi extension](packages/pi-extension/README.md) | Implemented; automatic mode is experimental | `packages/pi-extension` |
| [Claude Code mod](packages/claude-mod/README.md) | Implemented on Claude Code's early-access mods API; automatic mode is experimental | `packages/claude-mod` |

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

Launch Pi with `TYPESAFE_API_KEY` supplied by your usual secret manager, or as `TYPESAFE_API_KEY=...` in a `.env` file in the working directory, then run:

```text
/compact-adviser
```

Installing the package is consent to send eligible checkpoint context to TypeSafe when a key is available and other product gates pass.
It defaults to hints, checks a **constant 40,000-token minimum** before requesting a judgment, and only judges settled exchanges.
Optional automatic compaction requires explicit enablement and remains experimental.
The selected mode and token minimum persist across sessions and projects.

See the [Pi guide](packages/pi-extension/README.md) for settings, commands, privacy, safety limits, and tests.

## Claude Code quick start

From this repository's root, with `TYPESAFE_API_KEY` supplied by your usual secret manager or a working-directory `.env`:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir "$PWD/packages/claude-mod"
```

Then run:

```text
/compact-adviser
```

The mod has the same modes, constant 40,000-token minimum, and thresholds as the Pi extension.
Installing the package is consent to send eligible checkpoint context to TypeSafe when a key is available.
It relies on Claude Code's early-access mods API, verified on Claude Code 2.1.274, and does nothing unless `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is exactly `1`.
See the [Claude Code guide](packages/claude-mod/README.md) for installation, settings, commands, privacy, and the differences from Pi.

## Development

```sh
npm --prefix packages/pi-extension ci --ignore-scripts
npm run check
COMPACT_TEST_PI_BIN="$(command -v pi)" npm run test:e2e
```

Resolve the actual Pi executable **before** npm modifies PATH; the compatibility tests require Pi 0.82.0 and Python 3.
They use isolated configuration/session directories, a local deterministic model, and a mocked TypeSafe transport, not account credentials.

For the Claude Code mod:

```sh
npm --prefix packages/claude-mod ci --ignore-scripts
npm run check:claude-mod
npm run test:e2e:claude-mod
```

Its checks require the installed Claude Code; the live regression also requires `tmux` and uses an isolated configuration directory, a local stand-in for the model API, and a local TypeSafe fixture.

No hosted service or repository publication is needed.

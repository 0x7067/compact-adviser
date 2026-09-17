# Claude Code mod - reserved

This directory is the reserved home for a future Claude Code implementation of compact-adviser.
It is intentionally not implemented and cannot be installed yet.
There are no hooks, runtime entry points, or package manifest here.

The future mod must own its Claude-specific runtime, installation, dependencies, and configuration storage.
It must not load the Pi extension or reuse Pi's mutable configuration/session state.
The shared product semantics are described in [`../../docs/product-contract.md`](../../docs/product-contract.md).
Pi installation is independent and targets only the sibling [`../pi-extension`](../pi-extension) package.

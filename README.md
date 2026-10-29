<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/public/logo/moment-logo-light.png" />
    <img src="site/public/logo/moment-logo-dark.png" alt="moment." height="72" />
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mmmnt/core"><img src="https://img.shields.io/npm/v/@mmmnt/core.svg?label=npm" alt="npm" /></a>
  <a href="https://discord.gg/YcRqsQUQuu"><img src="https://img.shields.io/discord/1489758529219723486?color=5865F2&logo=discord&logoColor=white&label=Discord" alt="Discord" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg" alt="License: FSL-1.1-Apache-2.0" /></a>
</p>

# Moment

A DSL and toolchain for temporal DDD modeling.

Moment transforms `.moment` specification files into typed TypeScript implementations, Gherkin test scenarios, simulation topologies, and specification documents — creating a single source of truth for how bounded contexts communicate through time.

## Quick start

Moment requires **Node.js 22 or newer**.

```bash
npm install --save-dev @mmmnt/cli
npx moment parse model/           # validate a model directory as one project
npx moment generate model/shop.moment
```

A model declares bounded contexts and the flows that move through them:

```moment
context "Shop" [Core]
  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      input total: number
      emits OrderPlaced
    event OrderPlaced
      orderId: UUID
      total: number
  projection OrderSummary
    sources OrderPlaced
  query GetOrderSummary
    reads OrderSummary

flow "checkout"
  lane shop "Shop" [Core]
  moment "The customer places an order"
    shop: PlaceOrder
    shop: OrderPlaced
  moment "The customer checks the order"
    shop: GetOrderSummary
```

Run `npx moment --help` for every command.

## What's in 0.6

- **A complete modeling vocabulary (ADR-037).** Projections, queries, context-level rules with their enforcers, value objects, glossary terms and external systems, carried through code generation, specification documents and the context map.
- **Models held to the palette (ADR-038).** A policy is one event and one command, `orchestration` is the palette's saga, and aggregates can declare internal state. Completeness rules V22–V28 and palette rules V29–V37 check a model, and every read-only command, `serve --project` and `reconcile` take a model directory and check it as one project.
- **Breaking for existing models.** `chains-to` is required on every policy, and the `condition` and `"file-watcher"` policy triggers are removed. Run `moment parse <dir>` after upgrading.
- **Implementation sync (ADR-039).** `moment sync propose` records drift between a model and its implementation as proposals in `.domain/`; `sync accept` and `sync reject` decide them and commit the decision.
- **Node 22.** Node 20 reached end-of-life on April 30, 2026 and is no longer supported.

Per-package details are in each package's `CHANGELOG.md`.

## Packages

| Package | Description |
|---------|-------------|
| [`@mmmnt/core`](packages/core) | Langium parser, AST-to-IR transform, completeness and palette validation, project mode, manifest management, Sift import |
| [`@mmmnt/derive`](packages/derive) | Test topology, simulation scenarios, event catalog, impact analysis, saga state machines, topology emitter |
| [`@mmmnt/emit-ts`](packages/emit-ts) | TypeScript types, aggregates, read-model types, test scaffolds |
| [`@mmmnt/generate`](packages/generate) | Gherkin features, specification documents, AsyncAPI, Cucumber JSON |
| [`@mmmnt/harness`](packages/harness) | Test runner (structural validation for payload, saga, policy), event replay, contract assertion |
| [`@mmmnt/schema`](packages/schema) | Schema lifecycle governance, consumption manifest tracking |
| [`@mmmnt/sync`](packages/sync) | AST diffing, drift proposals and decisions, cascade reconciliation, Sift event stream reading |
| [`@mmmnt/viz`](packages/viz) | Context map and timeline rendering, visualization data envelope, live preview server |
| [`@mmmnt/cli`](packages/cli) | The `moment` command: parse, derive, generate, emit-ts, simulate, test, viz, serve, sync, reconcile, lint and more |
| [`@mmmnt/mcp`](packages/mcp) | Model Context Protocol server (7 tools, fully offline) |

The [VS Code extension](packages/vscode) provides syntax highlighting for `.moment` files.

## Documentation

Full documentation is maintained in the **[Moment Wiki](https://github.com/mmmnt/mmmnt/wiki)**.

- **[Product Overview](https://github.com/mmmnt/mmmnt/wiki/Moment)** — What Moment does, design principles, DSL examples
- **[The Moment DSL](https://github.com/mmmnt/mmmnt/wiki/The-Moment-DSL)** — The language, construct by construct
- **[Architecture](https://github.com/mmmnt/mmmnt/wiki/Architecture-Overview)** — Bounded context map, data flow
- **[Pipeline](https://github.com/mmmnt/mmmnt/wiki/Pipeline)** — parse → derive → generate, emit-ts and topology
- **[Package Reference](https://github.com/mmmnt/mmmnt/wiki/Package-Reference)** — All packages with their dependency graph
- **[Contributing](CONTRIBUTING.md)** — Setup, conventions, testing

## Developing Moment

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
corepack enable              # uses the pnpm version pinned in package.json
pnpm install
pnpm turbo run build
pnpm turbo run test
```

Use `turbo run <task>`: a bare `turbo generate` invokes Turbo's own code generator instead of the packages' `generate` task.

## Releases

Every `@mmmnt/*` package is versioned together and published to npm through [changesets](.changeset); each package keeps its own `CHANGELOG.md`, and each publish is tagged and released on GitHub. The earlier milestone tags (`v0.1.0-m2`, `v0.1.0-m3`, `v0.1.0-m6`, `v0.4.0`, `v1.0.0`) predate npm publishing and do not correspond to npm versions.

## Community

Join our [Discord server](https://discord.gg/YcRqsQUQuu) to discuss Moment, get help, and connect with other domain-driven teams.

## License

Moment is licensed under the [Functional Source License, Version 1.1, Apache 2.0 Future License (FSL-1.1-Apache-2.0)](LICENSE.md).

This means:

- The source code is available for reading, learning, and use under the FSL 1.1 terms.
- Two years after each version's release, that version automatically converts to the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0), a fully permissive open-source license.
- During the FSL period, the only restriction is on competing commercial use. See [LICENSE.md](LICENSE.md) for details.

Licensor: [Moment](https://github.com/mmmnt)

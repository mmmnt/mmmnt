<p align="center">
  <img src="site/public/logos/moment-wordmark-tagline.svg" alt="Moment — Domain architecture for the AI era" height="80" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mmmnt/core"><img src="https://img.shields.io/npm/v/@mmmnt/core.svg?label=npm" alt="npm" /></a>
  <a href="https://discord.gg/YcRqsQUQuu"><img src="https://img.shields.io/discord/1489758529219723486?color=5865F2&logo=discord&logoColor=white&label=Discord" alt="Discord" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg" alt="License: FSL-1.1-Apache-2.0" /></a>
</p>

# Moment

A DSL and toolchain for temporal DDD modeling.

Moment transforms `.moment` specification files into typed TypeScript implementations, Gherkin test scenarios, simulation topologies, and specification documents — creating a single source of truth for how bounded contexts communicate through time.

## Documentation

Full documentation is maintained in the **[Moment Wiki](https://github.com/mmmnt/mmmnt/wiki)**.

- **[Product Overview](https://github.com/mmmnt/mmmnt/wiki/Moment)** — What Moment does, design principles, DSL examples
- **[Architecture](https://github.com/mmmnt/mmmnt/wiki/Architecture-Overview)** — Bounded context map, data flow
- **[Pipeline](https://github.com/mmmnt/mmmnt/wiki/Pipeline)** — Reactive policy chain: parse → derive → [generate + emit-ts + topology]
- **[Package Reference](https://github.com/mmmnt/mmmnt/wiki/Package-Reference)** — All packages with dependency graph
- **[Contributing](https://github.com/mmmnt/mmmnt/wiki/Contributing)** — Setup, conventions, testing

## Packages

| Package | Description |
|---------|-------------|
| [`@mmmnt/core`](packages/core) | Langium parser, AST-to-IR transform, manifest management, Sift import |
| [`@mmmnt/derive`](packages/derive) | Test topology, simulation scenarios, event catalog, impact analysis, saga state machines, topology emitter |
| [`@mmmnt/emit-ts`](packages/emit-ts) | TypeScript types, aggregates, test scaffolds |
| [`@mmmnt/generate`](packages/generate) | Gherkin features, specification docs, AsyncAPI, Cucumber JSON |
| [`@mmmnt/harness`](packages/harness) | TestRunner (structural validation for payload, saga, policy), EventReplayEngine, ContractAssertionEngine |
| [`@mmmnt/schema`](packages/schema) | Schema lifecycle governance, codex rule evaluation |
| [`@mmmnt/sync`](packages/sync) | AST diff engine, cascade reconciliation, Sift event watching |
| [`@mmmnt/viz`](packages/viz) | Context map + timeline rendering, VizDataEnvelope, live preview server |
| [`@mmmnt/cli`](packages/cli) | 20+ commands: parse, derive, generate, emit-ts, simulate, test, viz, lint, and more |
| [`@mmmnt/mcp`](packages/mcp) | Model Context Protocol server (7 tools, fully offline) |

## Quick Start

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build
pnpm turbo test
```

## Releases

| Tag | Milestone |
|-----|-----------|
| [`v1.0.0`](https://github.com/mmmnt/mmmnt/releases/tag/v1.0.0) | Stable — full pipeline, all 10 packages, structural saga/policy validation, topology emitter, Facet output pipeline |
| [`v0.1.0-m6`](https://github.com/mmmnt/mmmnt/releases/tag/v0.1.0-m6) | Schema governance, viz, MCP server, sync |
| [`v0.1.0-m3`](https://github.com/mmmnt/mmmnt/releases/tag/v0.1.0-m3) | Derivation + Generation Pipeline |
| [`v0.1.0-m2`](https://github.com/mmmnt/mmmnt/releases/tag/v0.1.0-m2) | Specification Parsing |

## Community

Join our [Discord server](https://discord.gg/YcRqsQUQuu) to discuss Moment, get help, and connect with other domain-driven teams.

## License

Moment is licensed under the [Functional Source License, Version 1.1, Apache 2.0 Future License (FSL-1.1-Apache-2.0)](LICENSE.md).

This means:

- The source code is available for reading, learning, and use under the FSL 1.1 terms.
- Two years after each version's release, that version automatically converts to the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0), a fully permissive open-source license.
- During the FSL period, the only restriction is on competing commercial use. See [LICENSE.md](LICENSE.md) for details.

Licensor: [Moment](https://github.com/mmmnt)

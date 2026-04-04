<p align="center">
  <img src="site/public/logos/moment-wordmark-tagline.svg" alt="Moment — Domain architecture for the AI era" height="80" />
</p>

<p align="center">
  <a href="https://discord.gg/YcRqsQUQuu"><img src="https://img.shields.io/discord/1234567890?color=5865F2&logo=discord&logoColor=white&label=Discord" alt="Discord" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg" alt="License: FSL-1.1-Apache-2.0" /></a>
</p>

# Moment

A DSL and toolchain for temporal DDD modeling.

Moment transforms `.moment` specification files into typed TypeScript implementations, Gherkin test scenarios, and specification documents — creating a single source of truth for how bounded contexts communicate through time.

## Documentation

Full documentation is maintained in the **[Moment Wiki](https://github.com/mmmnt/mmmnt/wiki)**.

- **[Product Overview](https://github.com/mmmnt/mmmnt/wiki/Moment)** — What Moment does, design principles, DSL examples
- **[Architecture](https://github.com/mmmnt/mmmnt/wiki/Architecture-Overview)** — Bounded context map, data flow
- **[Pipeline](https://github.com/mmmnt/mmmnt/wiki/Pipeline)** — Reactive policy chain: parse → derive → [generate + emit-ts]
- **[Package Reference](https://github.com/mmmnt/mmmnt/wiki/Package-Reference)** — All packages with dependency graph
- **[Contributing](https://github.com/mmmnt/mmmnt/wiki/Contributing)** — Setup, conventions, testing

## Packages

| Package | Description |
|---------|-------------|
| [`@mmmnt/core`](https://github.com/mmmnt/mmmnt/wiki/@mmmnt-core) | Parser (Langium), IR, validators, manifest, Sift import |
| [`@mmmnt/derive`](https://github.com/mmmnt/mmmnt/wiki/@mmmnt-derive) | DerivationEngine: IR → TestSuiteTopology |
| [`@mmmnt/generate`](https://github.com/mmmnt/mmmnt/wiki/@mmmnt-generate) | GherkinGenerator + SpecDocGenerator → .feature, .md |
| [`@mmmnt/emit-ts`](https://github.com/mmmnt/mmmnt/wiki/@mmmnt-emit-ts) | TypeScriptEmitter + TestScaffoldEmitter → .ts, .spec.ts |

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

# @mmmnt/mcp

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.5.0
  - @mmmnt/derive@0.5.0
  - @mmmnt/generate@0.5.0
  - @mmmnt/emit-ts@0.5.0
  - @mmmnt/schema@0.5.0
  - @mmmnt/viz@0.5.0
  - @mmmnt/sync@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`560b5dd`](https://github.com/mmmnt/mmmnt/commit/560b5ddbce4a9bcbdbb96bef5458ac90df60bc52), [`a3581a8`](https://github.com/mmmnt/mmmnt/commit/a3581a884974e546497750d95db745abf37f181e)]:
  - @mmmnt/core@0.4.0
  - @mmmnt/derive@0.4.0
  - @mmmnt/emit-ts@0.4.0
  - @mmmnt/generate@0.4.0
  - @mmmnt/schema@0.4.0
  - @mmmnt/viz@0.4.0
  - @mmmnt/sync@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`5d4f13e`](https://github.com/mmmnt/mmmnt/commit/5d4f13e7ca741c2f41a9ee93335b6842673632e0)]:
  - @mmmnt/core@0.3.1
  - @mmmnt/derive@0.3.1
  - @mmmnt/emit-ts@0.3.1
  - @mmmnt/generate@0.3.1
  - @mmmnt/schema@0.3.1
  - @mmmnt/viz@0.3.1
  - @mmmnt/sync@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.3.0
  - @mmmnt/derive@0.3.0
  - @mmmnt/emit-ts@0.3.0
  - @mmmnt/generate@0.3.0
  - @mmmnt/schema@0.3.0
  - @mmmnt/sync@0.3.0
  - @mmmnt/viz@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
  - @mmmnt/core@0.2.0
  - @mmmnt/generate@0.2.0
  - @mmmnt/derive@0.2.0
  - @mmmnt/emit-ts@0.2.0
  - @mmmnt/schema@0.2.0
  - @mmmnt/viz@0.2.0
  - @mmmnt/sync@0.2.0

## 0.1.1

### Patch Changes

- [`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f) Thanks [@claude](https://github.com/claude)! - Updated package metadata: license field (FSL-1.1-Apache-2.0), author, exports, sideEffects, keywords, descriptions, and comprehensive READMEs for all packages.

- Updated dependencies [[`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f)]:
  - @mmmnt/core@0.1.1
  - @mmmnt/derive@0.1.1
  - @mmmnt/emit-ts@0.1.1
  - @mmmnt/generate@0.1.1
  - @mmmnt/schema@0.1.1
  - @mmmnt/sync@0.1.1
  - @mmmnt/viz@0.1.1

## 0.1.0

### Minor Changes

- [#100](https://github.com/mmmnt/mmmnt/pull/100) [`0f65b38`](https://github.com/mmmnt/mmmnt/commit/0f65b3815f666315aa47caee045c26932708d60d) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - ## 0.1.0 — M6 Application Layer + Release

  First public pre-GA release of the Moment domain specification language and implementation toolchain.

  ### Highlights
  - **Moment DSL** — Langium-based grammar for domain specifications with contexts, aggregates, commands, events, value objects, invariants, policies, sagas, and flows
  - **Field deprecation** — `[deprecated "reason" -> "replacement"]` modifier with downstream integration across all generators
  - **16 CLI commands** — init, parse, watch, derive, generate, emit-ts, test, viz, simulate, sync (status/propose/accept), schema (status), lint, import, reconcile, status
  - **MCP server** — 7 AI agent tools (validate, status, viz, get-events, import, emit-ts, reconcile) via stdio transport
  - **Simulation engine** — Multi-scenario generation with saga state transitions and negative scenarios
  - **TypeScript generation** — Types, aggregate roots with JSDoc, event union types, test scaffolds
  - **Gherkin generation** — BDD scenarios with Rules, Background blocks, saga + terminal branches
  - **Specification documents** — Mermaid context map + sequence diagrams, domain narrative, data glossary
  - **AsyncAPI contracts** — 3.0 YAML from crossing contracts
  - **Event catalog** — Producer/consumer/temporal tracing for all domain events
  - **Impact analysis** — Dependency graph across commands, events, policies, sagas
  - **Schema governance** — 4-phase lifecycle (Active/Deprecated/EndOfLife/Removed) with codex rules
  - **Implementation sync** — AST diffing, drift detection, cascade reconciliation (Category 1/2/3)
  - **Sift integration** — JSONL event stream import from `.domain/` per ADR-028
  - **Visualization** — Context maps, flow timelines, VizDataEnvelope

### Patch Changes

- Updated dependencies [[`0f65b38`](https://github.com/mmmnt/mmmnt/commit/0f65b3815f666315aa47caee045c26932708d60d)]:
  - @mmmnt/core@0.1.0
  - @mmmnt/derive@0.1.0
  - @mmmnt/emit-ts@0.1.0
  - @mmmnt/generate@0.1.0
  - @mmmnt/schema@0.1.0
  - @mmmnt/sync@0.1.0
  - @mmmnt/viz@0.1.0

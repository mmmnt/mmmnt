# @mmmnt/harness

## 0.15.0

### Patch Changes

- [#227](https://github.com/mmmnt/mmmnt/pull/227) [`345f494`](https://github.com/mmmnt/mmmnt/commit/345f4943035f9fc55e56e2dce67a834013f47387) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - The harness replays branch-lanes and checks contract values by their Moment type.

  - harness: `EventReplayEngine` resolves a placement on a `branch-lane` (or a lane classified `[Terminal]`) to the lane, as `moment parse` does, and a placement on an `[External]` lane to the declared external. TicketWave replays all eight flows with no divergence; it reported five false ones in N1 to N4. A placement on a context the IR does not define, or on a lane of another flow, still diverges.
  - harness: `ContractAssertionEngine` checks a value against its Moment type as `@mmmnt/schema` maps it (ADR-049). `UUID`, `DateTime` and `Date` are strings of that format, `Money` is a number, `T[]` is an array of `T` checked item by item, and a value object is an object. A valid UUID no longer fails as a type mismatch. Given the IR (`new ContractAssertionEngine(ir)`), a value object is checked as declared: its fields, a scalar value object with its pattern, a code set by its values, a tagged union by its `kind`, maps, exclusive groups and `[encrypted]` fields. New violations: `format mismatch`, `pattern mismatch`, `not in code set` and `exclusive fields`.

- Updated dependencies [[`98ba180`](https://github.com/mmmnt/mmmnt/commit/98ba180e76b8b6fee2b6c8d4500657e7b2b5f75a), [`c7f6001`](https://github.com/mmmnt/mmmnt/commit/c7f6001899078840d2218d5afcb9e02e41cb6aed)]:
  - @mmmnt/core@0.15.0
  - @mmmnt/derive@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.14.0
  - @mmmnt/derive@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.13.0
  - @mmmnt/derive@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.12.0
  - @mmmnt/derive@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.11.0
  - @mmmnt/derive@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.10.1
  - @mmmnt/derive@0.10.1

## 0.10.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.10.0
  - @mmmnt/derive@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.9.0
  - @mmmnt/derive@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.8.0
  - @mmmnt/derive@0.8.0

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.7.2
  - @mmmnt/derive@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.7.1
  - @mmmnt/derive@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [`550a2b6`]:
  - @mmmnt/core@0.7.0
  - @mmmnt/derive@0.7.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`b4214eb`](https://github.com/mmmnt/mmmnt/commit/b4214eb1c21be33f0a5f41803891a0106ef9b1d3)]:
  - @mmmnt/core@0.6.2
  - @mmmnt/derive@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`f2741d5`](https://github.com/mmmnt/mmmnt/commit/f2741d5858721c2bed74b6d99db0d80af1cebd9d), [`a80df89`](https://github.com/mmmnt/mmmnt/commit/a80df89f2a773f1642fdc3781f88ab4580ea944b)]:
  - @mmmnt/core@0.6.1
  - @mmmnt/derive@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f), [`a06ff54`](https://github.com/mmmnt/mmmnt/commit/a06ff54321599311357388d513e372246e31ccad), [`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f), [`160323b`](https://github.com/mmmnt/mmmnt/commit/160323b7001dc079e8136703a516bc150a8541c0)]:
  - @mmmnt/core@0.6.0
  - @mmmnt/derive@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.5.0
  - @mmmnt/derive@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`560b5dd`](https://github.com/mmmnt/mmmnt/commit/560b5ddbce4a9bcbdbb96bef5458ac90df60bc52), [`a3581a8`](https://github.com/mmmnt/mmmnt/commit/a3581a884974e546497750d95db745abf37f181e)]:
  - @mmmnt/core@0.4.0
  - @mmmnt/derive@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`5d4f13e`](https://github.com/mmmnt/mmmnt/commit/5d4f13e7ca741c2f41a9ee93335b6842673632e0)]:
  - @mmmnt/core@0.3.1
  - @mmmnt/derive@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.3.0
  - @mmmnt/derive@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
  - @mmmnt/core@0.2.0
  - @mmmnt/derive@0.2.0

## 0.1.1

### Patch Changes

- [`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f) Thanks [@claude](https://github.com/claude)! - Updated package metadata: license field (FSL-1.1-Apache-2.0), author, exports, sideEffects, keywords, descriptions, and comprehensive READMEs for all packages.

- Updated dependencies [[`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f)]:
  - @mmmnt/core@0.1.1
  - @mmmnt/derive@0.1.1

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

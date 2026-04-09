# @mmmnt/cli

## 0.2.0

### Minor Changes

- 6e7d6ed: **feat(generate): Cucumber JSON formatter and `moment cucumber-json` command**

  Adds a Cucumber JSON formatter to `@mmmnt/generate` and a corresponding
  `moment cucumber-json <file.moment>` CLI command. Output is suitable for
  import into Xray (Jira test management) via the
  `/import/execution/cucumber` endpoint, enabling Moment-derived BDD scenarios
  to flow directly into existing test management workflows.

- 6e7d6ed: **feat(cli): `moment serve` — WebSocket live bridge to Facet (ADR-031)**

  Adds the `moment serve` command that runs the full pipeline (parse → derive →
  topology + scenarios) and exposes it over a WebSocket on `ws://localhost:<port>`
  for live consumption by Facet. Sends `WsInitialLoad` on connection, watches the
  spec file for changes, and pushes `topology-update` / `scenario-update` /
  `artifact-update` messages on every rebuild. Heartbeats and graceful shutdown
  included.

  ```bash
  moment serve <file.moment> [--port 4321] [--all]
  ```

- 6e7d6ed: **feat(cli/derive): `moment simulate` redesign — `--all`, per-scenario files, ADR-029 artifacts**

  Substantial reshape of the simulate command and its derivation pipeline:
  - **`--all` flag** generates every branch combination plus negative
    (precondition-violation) scenarios in a single run.
  - **Per-scenario file output** under `--out-dir`: each scenario lands in its
    own `<scenarioId>.json` instead of being lumped into one file. A
    `manifest.json` indexes the run.
  - **`TopologyEmitter`** writes per-flow `topology-<flow>.json` files alongside
    the scenarios.
  - **ADR-029 artifacts**: `event-catalog.json`, `impact-analysis.json`,
    `saga-state-machines.json`, and `asyncapi.yaml` are emitted into the same
    `--out-dir` so downstream consumers (Facet, Xray, AsyncAPI tooling) get a
    complete bundle from one command.
  - **Trailing newline** on all generated JSON for prettier/git-friendly diffs.

### Patch Changes

- 6e7d6ed: **fix(cli): make the `moment` binary discoverable in workspace consumers**
  - Enable workspace package hoisting so `@mmmnt/cli`'s `moment` binary lands
    on the `PATH` in repos that consume the package.
  - Add a top-level `moment` script to the root `package.json` so `pnpm moment`
    works from any workspace package.

- 6e7d6ed: **fix(cli): `moment generate` and `moment emit-ts` now write outputs to disk**

  `runGenerate` and `runEmitTs` previously invoked the emitters but only
  reported counts from the in-memory `Map<string, string>` — no files were
  ever persisted. In a fresh project both commands printed a success message
  while producing zero artifacts on disk.
  - New shared `project-fs` helper resolves the output base directory
    (project root from `.manifest.yaml` or `cwd`) and writes files to disk.
  - `generate` writes TypeScript types, test scaffolds, `.feature` files,
    and `specification.md`.
  - `emit-ts` writes TS types and scaffolds, still honors `--dry-run`.
  - Both commands accept `--out <dir>` for an explicit output override.
  - The writer rejects absolute paths and verifies each resolved target stays
    inside `baseDir` using a path-separator boundary check (defense in depth
    against path traversal via user-controlled names in `.moment` specs).

  **fix(core): move `langium` to runtime dependencies**

  `@mmmnt/core`'s generated parser plus `parser/`, `validation/`, and
  `moment-module.ts` all `import from 'langium'` at runtime, but it was
  declared only in `devDependencies`. Consumers installing `@mmmnt/core` had
  no way to resolve it, breaking any command that parses a `.moment` file in
  a fresh install. Moved `langium: 4.2.1` to `dependencies`; `langium-cli`
  stays in `devDependencies`.

- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
- Updated dependencies [6e7d6ed]
  - @mmmnt/core@0.2.0
  - @mmmnt/generate@0.2.0
  - @mmmnt/derive@0.2.0
  - @mmmnt/emit-ts@0.2.0
  - @mmmnt/harness@0.2.0
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
  - @mmmnt/harness@0.1.1
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
  - @mmmnt/harness@0.1.0
  - @mmmnt/schema@0.1.0
  - @mmmnt/sync@0.1.0
  - @mmmnt/viz@0.1.0

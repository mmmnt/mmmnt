# @mmmnt/core

## 0.2.0

### Patch Changes

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

## 0.1.1

### Patch Changes

- [`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f) Thanks [@claude](https://github.com/claude)! - Updated package metadata: license field (FSL-1.1-Apache-2.0), author, exports, sideEffects, keywords, descriptions, and comprehensive READMEs for all packages.

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

# @mmmnt/core

## 0.6.1

### Patch Changes

- [#191](https://github.com/mmmnt/mmmnt/pull/191) [`f2741d5`](https://github.com/mmmnt/mmmnt/commit/f2741d5858721c2bed74b6d99db0d80af1cebd9d) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Refresh dependencies within their existing ranges. `@mmmnt/cli` picks up `ws` 8.22, which clears its high-severity advisory.

- [#193](https://github.com/mmmnt/mmmnt/pull/193) [`a80df89`](https://github.com/mmmnt/mmmnt/commit/a80df89f2a773f1642fdc3781f88ab4580ea944b) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - V17 now warns only when `returns-to` loops nest or cross. Several branches of one moment returning to the same step, or loops that follow one another, no longer warn.

## 0.6.0

### Minor Changes

- [#181](https://github.com/mmmnt/mmmnt/pull/181) [`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Grammar completeness, palette conformance, project mode and sync (ADR-037, ADR-038, ADR-039).

  **Grammar (ADR-037).** Projections with sources, description and fields; query declarations; context-level rules with a declared or external enforcer; value objects at the context level; per-context glossary terms; external systems as relationship ends and External lanes. Flow nodes resolve to projection and query kinds. Code generation emits read-model types for value objects, projections and queries; the specification document renders projections, queries, rules, terms and externals; the context map draws externals.

  **Palette conformance and project mode (ADR-038).** The grammar is held to the NDD palette: a policy is one domain event and one command; `orchestration` is the palette's saga (`saga` remains an alias), invoked by one of its own commands, issuing aggregate commands and `<External>.<operation>`, and compensating with named commands or `compensation none`; aggregates may declare internal `state`; projections, policies, orchestrations and externals may declare gateways. Completeness rules V22–V28 and palette rules V29–V37 check a model; V21 is retired (V34 covers it). Every read-only command, `serve --project`, and `reconcile` accept a model directory and load it as one merged project; project mode checks node placement, saga transitions and external lanes across files.

  **Sync (ADR-039).** `sync propose` persists drift proposals in `.domain/`; `sync accept` and `sync reject` decide them with the deciding identity from git, record feedback in an append-only journal, and commit exactly the paths they name.

  **Breaking for existing models.**
  - `chains-to` is now required on every policy, and the `condition` and `"file-watcher"` policy triggers are removed: a model using them no longer parses.
  - V22–V37 are warnings for a single file and errors over a merged project, so `moment parse <dir>` can fail on a model that previously passed.

  Run `moment parse <dir>` after upgrading.

- [#181](https://github.com/mmmnt/mmmnt/pull/181) [`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Upgrade Langium to 4.4.0 and require Node 22.

  Langium 4.2.1 pinned chevrotain ~11.1.1, which pinned `lodash-es` to exactly 4.17.23, a version with a high-severity advisory (patched from 4.17.24); every consumer of `@mmmnt/cli` installed it and could not override it. Langium 4.4.0 uses chevrotain 13.2, which no longer depends on `lodash-es`, and chevrotain-allstar 0.5, which requires `lodash-es` ^4.18.1.

  **Breaking: Node 20 is no longer supported.** Every Langium release free of the vulnerable pin depends on chevrotain 12 or 13, which require Node 22. Node 20 reached end-of-life on April 30, 2026. All packages now declare `node >=22`, and CI tests on Node 22 and 24.

  Diagnostic messages that LSP 3.18 may now deliver as MarkupContent are reduced to their text, so the IR's `Diagnostic.message` stays a string.

- [#184](https://github.com/mmmnt/mmmnt/pull/184) [`160323b`](https://github.com/mmmnt/mmmnt/commit/160323b7001dc079e8136703a516bc150a8541c0) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Remaining fixes from the 0.6 documentation pass.
  - **`moment sync status` exits 1 when the implementation has drifted**, like `moment status`, so CI can gate on it. The report still prints on stdout (`--json` too) for callers that only want to read it.
  - **Two new reference rules.** V38: every aggregate command `emits` an event declared in the model. V39: every `triggers` target is placed in the same flow (`triggered-by` was already checked by V5). Like V22–V37 they are warnings for a single file and errors over a project, so `moment parse <dir>` can now fail on a model that names an undeclared event or a missing trigger target.
  - **The file watcher watches every configured directory.** It skipped any directory whose absolute path contained no dot, so `moment watch` with `paths: ['model']` never fired.
  - **Diagnostics without a position name their file alone** instead of `file:0:0` or `<unknown>`.
  - **`@mmmnt/mcp` loads model directories.** Every tool that takes a `filePath` accepts a directory and loads it as one project, as the CLI does, reading `.domain/` from that directory; diagnostics carry their rule id and source. `loadSpecification` moved into `@mmmnt/core` so the CLI and the MCP server share it.
  - **`@mmmnt/mcp` reports its real version** instead of `0.0.0`, drops two unused dependencies (`@mmmnt/schema`, `@mmmnt/generate`), and moves to `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7, clearing its high and critical advisories.
  - The CLI and MCP bundles target Node 22.

### Patch Changes

- [#183](https://github.com/mmmnt/mmmnt/pull/183) [`a06ff54`](https://github.com/mmmnt/mmmnt/commit/a06ff54321599311357388d513e372246e31ccad) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Fixes found while documenting 0.6.
  - **`moment <command> --help` no longer runs the command.** Commands that ignored unknown flags ran instead: `moment init --help` initialised a project in the current directory. Any command given `--help` or `-h` now prints its own usage and exits 0.
  - **`moment parse` prints warnings on success.** Rules V22–V37 report warnings for a single file; they were computed but never shown. Diagnostics now name their rule (`V22: …`), and rules without a position are attributed to the file parsed.
  - **Reconcile and Sift import no longer misread sync logs.** The Sift event reader skips the `sync-state`, `implementation-feedback` and `push-flow-saga` logs that `moment sync` writes into `.domain/`, which it had reported line by line as malformed Sift events.
  - **Reads are not described as emissions.** Generated specification documents and Gherkin say a query step "answers query" and a projection step "serves projection" instead of "emits" (ADR-037).

## 0.5.0

### Minor Changes

- Truthfulness overhaul + saga transition event mapping.

  Grammar: `states A -> B on Event` maps saga transitions to domain events
  (`on` is now a reserved keyword); `MomentDefinition.sequence` preserves
  textual child order.

  Generators: `returns-to` loop-unroll, exact causation, branch-pruned
  enumeration, walk-derived labels/kinds/activeBranches, SimSaga progression
  through mapped transitions, saga timeout scenario synthesis, payloads
  unioned with crossing contract fields, `policy-definitions.json` artifact,
  frame→frame return edges with eventType on every connection, flow-only
  catalog/impact/asyncapi fallbacks, pending-status cucumber, `it.todo`
  scaffolds, truthful Gherkin branch tags and crossing contracts.

  Validators: single-file wiring of the dormant cross-file/SP checks plus new
  V19/V20/V21; V8 CST-offset terminal check; V12 crash fix.

## 0.4.0

### Minor Changes

- [#153](https://github.com/mmmnt/mmmnt/pull/153) [`560b5dd`](https://github.com/mmmnt/mmmnt/commit/560b5ddbce4a9bcbdbb96bef5458ac90df60bc52) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - **feat(core): GeneratorRegistry with DAG planner and descriptor interfaces**

  New open generator registry in `@mmmnt/core` replacing the hardcoded
  `ALLOWED_FORMATS` set (MMNT-5430 / ADR-032 R1 / ADR-034 G2+G3).
  - `GeneratorDescriptor` interface: `format`, `scope`, `dependsOn`,
    `defaultOutputDir`, `run(ctx) → Promise<GeneratorRunResult>`
  - `GeneratorRunContext`: provides `ir`, `manifestDir`, `outputDir`,
    `options`, and `upstreamOutputs` (results from declared dependencies)
  - `GeneratorRunResult`: returns `files: Map<string, string>` (in-memory)
    - `diagnostics` — framework handles disk writes with path safety
  - `GeneratorRegistry` class: `register()`, `resolve()`, `has()`,
    `getAll()`, `getFormats()`, `planExecutionOrder()`
  - Topological sort via Kahn's algorithm with cycle detection
  - Deterministic ordering: independent generators sort alphabetically

  Each generator package will export a `registerGenerators(registry)`
  function (next story). The CLI's project-mode bootstrap calls them all.
  No circular dependencies — `@mmmnt/core` exports only the interface +
  registry class.

- [#151](https://github.com/mmmnt/mmmnt/pull/151) [`a3581a8`](https://github.com/mmmnt/mmmnt/commit/a3581a884974e546497750d95db745abf37f181e) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - **feat(core): ProjectLoader for multi-file IR merge + cross-file validation**

  New `ProjectLoader` class in `@mmmnt/core` that loads multiple `.moment`
  files and produces a single merged `IntermediateRepresentation`. This is
  the Phase 1 foundation for project-level execution (MMNT-5418 / ADR-032 R2).

  Three new modules in `packages/core/src/project/`:
  - **`ProjectLoader`**: reads N files, parses each via `MomentParser`,
    merges IRs, runs cross-file validation, returns a `ProjectLoadResult`
    with the merged IR + aggregated diagnostics.
  - **`mergeIrs`**: pure function that concatenates `contexts[]`, `flows[]`,
    `glossary[]`, `relationships[]` from N IRs with deterministic ordering
    (sorted by file path). Detects duplicate context names across files.
  - **`validateCrossFileReferences`**: post-merge validator that checks lane
    contextIds, crossing targetContextIds, moment entry contextIds, and
    relationship endpoints all resolve to contexts in the merged IR. Skips
    branch-lanes and terminal-classified lanes (synthetic flow-control
    constructs, not real bounded contexts).

  ```typescript
  import { ProjectLoader } from '@mmmnt/core';

  const loader = new ProjectLoader();
  const result = await loader.loadProject([
    'contexts/ordering.moment',
    'contexts/fulfillment.moment',
    'flows/order-placed.moment',
  ]);

  if (result.success) {
    console.log(result.ir.contexts.length); // 2
    console.log(result.ir.flows.length); // 1
  }
  ```

## 0.3.1

### Patch Changes

- [#146](https://github.com/mmmnt/mmmnt/pull/146) [`5d4f13e`](https://github.com/mmmnt/mmmnt/commit/5d4f13e7ca741c2f41a9ee93335b6842673632e0) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - **fix(core): reject absolute / escaping paths in manifest fields**

  `ManifestReader` now validates that `generators[].outputDir`,
  `contexts[].path`, and `flows[].path` in a `.manifest.yaml` are relative
  paths that stay inside the manifest directory. Previously any of these
  fields could be an absolute path (`/etc/evil`) or use `../` to climb
  outside the project, and downstream consumers would honor them:
  - A malicious `outputDir` would make `moment generate` / `moment emit-ts`
    write outside the project (path-traversal write).
  - A malicious `contexts[].path` / `flows[].path` would make the parser
    read and interpret arbitrary files as `.moment` specs.

  Both are now rejected at manifest-load time with a clear diagnostic
  pointing at the specific field:

  ```
  Manifest validation failed: generators[0].outputDir '/etc/evil' must be
  a relative path (absolute paths are rejected).
  ```

  The boundary check uses a path-separator boundary so `/base-sibling`
  can't masquerade as being inside `/base` — same shape as the guard in
  `@mmmnt/cli`'s `project-fs.ts`, duplicated locally because `@mmmnt/core`
  cannot depend on `@mmmnt/cli`.

  Closes P2 [#6](https://github.com/mmmnt/mmmnt/issues/6) from the post-mortem.

## 0.3.0

### Minor Changes

- Version bump only (fixed group release). See [`@mmmnt/cli@0.3.0`](../cli/CHANGELOG.md#030) for the user-facing changes in this release.

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

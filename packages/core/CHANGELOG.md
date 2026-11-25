# @mmmnt/core

## 0.15.0

### Patch Changes

- [#228](https://github.com/mmmnt/mmmnt/pull/228) [`98ba180`](https://github.com/mmmnt/mmmnt/commit/98ba180e76b8b6fee2b6c8d4500657e7b2b5f75a) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Project mode agrees with a single file on crossings, and every validation diagnostic names its rule.

  - core: PM-04 accepts a crossing whose event is declared by its source context or by its target context, as SP-02 does. A crossing carries the source context's event, so the target-only rule warned on every crossing of TicketWave. An event declared by neither context still warns.
  - core: a syntax-level diagnostic (V1 to V20, V52 to V55, and the parser's SP-01 to SP-03) carries its rule id in `ruleId`, as a model-level one does. Its message still begins with the id (`V55: ...`), so code that reads the message is unaffected.
  - cli: `moment parse examples/ticketwave/spec/` prints no PM-04 warning.

- [#236](https://github.com/mmmnt/mmmnt/pull/236) [`c7f6001`](https://github.com/mmmnt/mmmnt/commit/c7f6001899078840d2218d5afcb9e02e41cb6aed) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Derived sample payloads have the formats their types declare, a crossing contract names only fields its event declares, and the cli type-checks.

  - derive: a `UUID` field samples a valid UUID, a version 8 (custom) UUID made from the SHA-256 of the field name. It was `<name>-001`, which a format check of UUIDs rejects. A field has the same UUID in every payload and on every run, so the same model still gives byte-identical scenarios. `DateTime`, `Date` and `Money` samples already had their formats and do not change.
  - core: new rule V58. A crossing's `contract` field that the crossing event does not declare is a warning on a single file and an error over a project, like the other model-level rules. The diagnostic carries `ruleId: 'V58'`.
  - Behaviour change: V58 can turn a project that loaded clean into one that fails. Declare the field on the event, or drop it from the contract.
  - TicketWave's crossings of `PaymentInitiated` and `PaymentConfirmed` now name only fields their events declare.
  - cli: `tsc --noEmit -p packages/cli` passes. The `derive` command read `result.notices`, which `runDerive` never returns; that line is gone and output is unchanged. The cli has a `typecheck` script, so CI's `pnpm turbo typecheck` checks it.

## 0.14.0

### Minor Changes

- [`6f80ae3`](https://github.com/mmmnt/mmmnt/commit/6f80ae32cec4f161d0be1d5d06d4aaf51df8f3d4) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Any Moment keyword may name a field, an input or a lane (ADR-051).

  - core: a field (of an event, a value object, a variant, an exclusive group, an identity or a projection), a command, orchestration-command or query input, a lane, and every segment of a policy condition path may be named with any word the grammar reserves: `scope`, `policy`, `context`, `trigger`, `type`, `on`, `state`, `when`, `string`, ... A name is followed by `:` or `?:`, which no declaration that begins with the same word is, so the parser tells them apart. One rule, `ReservedWord`, replaces the word-by-word escapes of ADR-037, ADR-040, ADR-043, ADR-045 and ADR-049; a spec reads the grammar's keywords and fails if one is missing from it. A crossing's `contract` fields stay identifiers. No new token, IR key or rule.

  Not breaking: every model that parsed under 0.13.0 has the same IR, and `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all`, `generate`, `emit-ts`, `board` and `schema emit` write the same files for TicketWave, every valid fixture and the Sift model copy.

## 0.13.0

### Minor Changes

- [`e39ae92`](https://github.com/mmmnt/mmmnt/commit/e39ae92e0a61b6a6bd55f59ab5a4a4b0a8f681cc) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - A policy condition reads the variant of a tagged union field (ADR-050).

  - core: a policy's `when` field may be the path `<field>.kind` on a field of its trigger typed by a tagged union (ADR-049): `trigger DecisionRecorded when decision.kind = Admitted`. The IR's `condition.field` is the path as written (`"decision.kind"`) and `condition.equals` the variant; no IR key is added, and a condition without a dot is unchanged. No new keyword or token (`.` already was one). New rules, with V49's severity (a warning per file, an error over a merged project): V56 (a path on a field that is not a single union, a segment other than `kind`, or a union field guarded without `.kind`) and V57 (a variant the union does not declare). V49 checks a path's first segment.

  Not breaking: every model that parsed under 0.12.0 has the same IR, and `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all`, `generate`, `emit-ts`, `board` and `schema emit` write the same files for TicketWave, every valid fixture and the Sift model copy. A Facet that does not read dotted paths treats the guard as undecidable, so it holds the reaction at every occurrence, as for a policy with no condition.

## 0.12.0

### Minor Changes

- [`e9c9266`](https://github.com/mmmnt/mmmnt/commit/e9c9266d3f0dd7adfac7fcd1c330d8b052a29059) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Fields declare optionality, code sets, unions, maps and patterns, and `moment schema emit` writes one closed JSON Schema per event payload (ADR-049).

  - core: `name?: T` is optional; `"a" | "b"` is a code set; `value-object Name: T` is a scalar value object (a code set when `T` is one) and a value object with `| Variant` lines is a tagged union discriminated by `kind`; `a: T | b: U` on one field line is an exclusive group (exactly one present); `T{}` and `T{key}` are maps keyed by string; `[pattern "<regex>"]` and `[encrypted]` are field attributes beside `[deprecated …]`. The IR gains optional keys only: `FieldDefinition.enum`, `map`, `pattern`, `encrypted`, `exclusive` and `ValueObjectDefinition.scalar`, `variants`; `required` is `false` for an optional field and for every member of an exclusive group. `pattern` is a new keyword, escaped in field, input and lane names; `?`, `{` and `}` are new tokens. New rules, errors in a single file: V52 (a union field named `kind`), V53 (a variant or a code twice), V54 (an optional member of an exclusive group), V55 (an invalid pattern, or a pattern on a type that is not string-valued).

  Not breaking: every model that parsed under 0.11.0 has the same IR, and `parse`, `test`, `simulate --all`, `derive`, `generate` and `emit-ts` write the same files for TicketWave, every valid fixture and the Sift model copy.

## 0.11.0

No changes in this release.

## 0.10.1

### Patch Changes

- Project mode no longer reports a per-file V49, V50 or V51 that the merged project does not report (ADR-045).

  - core: `ProjectLoader` drops a per-file diagnostic only for the rules the merged validation re-checks, and matched V22 to V48. A policy `trigger X after Y` in one context file, with `Y` declared in another file, got a spurious V50 in `moment parse <dir>`. Every rule from V22 on is now treated as checked over the merge, so a rule added later needs no change here.

## 0.10.0

### Minor Changes

- A policy declares the condition under which it reacts, and the branch stamp moves to its own key (ADR-045, ADR-046).

  ADR-045, a policy declares the condition under which it reacts:

  - core: `trigger E when <field> = <value>` and `trigger E after <Event>` on a policy, in that order, either or both. `=` is a new token and `after` a new keyword, escaped in `FieldName` and `LaneName` so a field, lane or input named `after` still parses. The IR's `PolicyDefinition` gains an optional `condition` (`field` and `equals`, and/or `after`); a policy that declares none has no such key. New rules: V49 (a `when` field the trigger does not carry), V50 (an `after` event that is not declared), V51 (an advisory: no flow places the `after` event before the trigger). A guard on a field named `outcome` is allowed.

  Compatibility: golden comparison against the 0.9.0 build on every valid fixture, ticketwave at its 0.9.0 spec and the SAMMI model (simulate, generate, emit-ts, derive, viz, parse). The only differences are an added `"$branch"` line on every event inside an arm and `"field": "outcome"` becoming `"field": "$branch"` in branch predicates; every other output is byte-identical. The specs were verified by reintroducing each defect.

## 0.9.0

### Minor Changes

- [`2debed1`](https://github.com/mmmnt/mmmnt/commit/2debed1062f0067d6d30c8c40df10ef4ca02cb5b) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Branch paths: negatives for every path, an arm that ends at an outcome, and the arm a topology connection is declared in (ADR-042, ADR-043, ADR-044).

  ADR-043, an arm may end at an outcome:

  - core: a second exit modifier, `[outcome]`. It sets `terminal: true` and `exit: 'outcome'` on the IR entry, so everything that stops at a terminal behaves the same. `[terminal]` is unchanged and stays a failure exit. `outcome` is a keyword inside the modifier brackets and is escaped in `FieldName` and `LaneName` (and so in input names), so a field, lane or input named `outcome` still parses. V8 (a terminal is the last node of its block) holds for `[outcome]` too.
  - Syntax files (core and vscode) know the new word. A model that does not use `[outcome]` has a byte-identical IR and derived output.

  Compatibility: golden comparison against the build of 0.8.0 on every valid fixture, ticketwave at its previous spec and the SAMMI model. Every old scenario is present and byte-identical; the new build adds only the negatives above; topology differs only by the `branchCondition` keys; every other artifact is byte-identical. The three regression specs were verified by reintroducing each defect.

## 0.8.0

### Minor Changes

- A command records one or more events: events recorded together, and alternative outcomes chosen by state (ADR-041).

  Syntax (aggregate commands, and orchestration commands for the process events they declare):

  - `emits A` records one event, as before. `emits A, B` records both in one transaction. `emits A | B` records exactly one of them, chosen by the aggregate's state. `emits A when Open | A, B when OneUseLeft` names the declared state in which each outcome is recorded. `,` binds tighter than `|`; `when` belongs to the outcome it follows. No keyword is added.

  Rules:

  - V31 and V38 check every event of every outcome (the message for a single event is unchanged). New V44: a command that records more than one distinct event records only its own aggregate's events (a single-event command is unchanged). V45: an event is listed once inside one outcome. V46: a `when` names a declared state, no two outcomes share one, and a command guards every outcome or none; alternatives with no guard are an advisory. V47: the events a flow places after one placement of a multi-event command come from one outcome (part of an outcome is an advisory). V48: an outcome that no flow places, over a merged project only (an advisory). V44 to V48 are advisories per file and errors over a merged project, except where a finding carries its own severity (V46 errors; the V46 missing-guard advisory, the V47 partial outcome and V48 are always warnings).
  - A project now keeps the findings of a file it could not merge. Before, an error in a file whose own findings include one that the merged validation re-reports could be dropped with the file.

  IR:

  - core: a plain `emits A` writes `emitsEvent` and nothing else, so the IR of every model that parses today is byte-identical. Any other clause adds `outcomes: { events: string[]; whenState?: string }[]` to `CommandDefinition` and `OrchestrationCommandDefinition`, and `emitsEvent` is the first event of the first outcome. New helpers `emittedEvents(cmd)` and `emitOutcomes(cmd)` read a command's events and outcomes (hand-built IR that sets only `emitsEvent` reads as a single outcome); no package reads the fields directly (a test sweeps the sources). `momentPlacements` exposes the events a flow places for a command.

  Compatibility: every model that parses today parses with an identical IR and identical derived artifacts. This was checked on every valid fixture, the rule ids of every invalid fixture, ticketwave at its previous spec and the SAMMI model, against the build of 0.7.2, and the comparison fails on a build that writes `outcomes` for a plain `emits`. The ticketwave example now uses the new forms (`HoldClosed` recorded with `HoldConvertedToReservation`; `AccessCodeExhausted` on the last use of an access code) and its facet files are regenerated, so its scenarios and tests change.

## 0.7.2

### Patch Changes

- Audit fixes and corrections to the 0.7.0 notes.

  - **V43 is an error in a single file when the file can decide.** A same-moment `triggered-by` must be a hop a policy declares. When the node is a policy (event -> policy) or the cause is a policy (policy -> command), the supporting declaration is that policy's own, so a file that declares the policy now fails with V43 instead of passing with a warning. When the hop is event -> command, the supporting policy may be declared in another file, so V43 stays an advisory per file; over a merged project it is always an error. This restores the guarantee V5 gave before it was relaxed, without needing the whole project when the file already holds the answer.
  - **V5 keeps its safe default.** A `triggered-by` check on a node that its moment does not hold sees no earlier siblings, rather than all but the last. The V43 message names the moment from the flow's own moment list.
  - **Correction to the 0.7.0 notes.** `causes`, as well as `note` and `cause`, became a keyword: a node (command, event, policy and so on) named `causes` no longer parses. Lane names and field names are unaffected.

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- Process events, cause-scoped preconditions, note-only moments and same-moment hops (ADR-040).

  - core: an orchestration declares `event`s that its commands emit (`SagaDefinition.events`, `EventDefinition.owner`, in the flat `ContextDefinition.events` too). A command declares `causes`, a precondition names the `cause`s it applies to, and a placement names the `cause` it issues the command for. A moment may hold `note "text"` or `note <lane>: "text"` (`MomentDefinition.notes`, kept in `sequence`). `triggered-by` may name an earlier node of the same moment.
  - core: V31 now accepts an orchestration command that emits an event the orchestration declares. V10 counts a note. V5 is a rule about source order. New V40 (one owner per event), V41 (a cause is one the command declares), V42 (a command with scoped preconditions is placed with its cause) and V43 (a same-moment `triggered-by` is a hop a policy declares). V40 to V43 are advisories per file and errors over a merged project. A flow placed in a single file can now name an orchestration command and a process event (V1).
  - core: `cause`, `causes` and `note` become keywords. A field, input or lane named so keeps parsing. A node named `note` or `cause` no longer parses.
  - derive: preconditions of orchestration commands derive negative scenarios. A precondition scoped to a cause derives only in flows that place the command for that cause; the failure event and the `when` text name the cause. The event catalog, impact analysis and topology attribute a process event to its orchestration, and topology frames carry notes and nodes their cause.
  - generate: a note renders as a comment line in Gherkin and as a narrated step in the specification document; a note-only moment produces no scenario.
  - emit-ts: process events are emitted as types.
  - viz: the timeline draws a note-only moment, same-moment hops and causes.

  Derived output changes for existing models that place an orchestration command with preconditions: it now adds the negative scenarios for them. `moment parse` and `moment test` results are unchanged for existing models.

## 0.6.2

### Patch Changes

- [#196](https://github.com/mmmnt/mmmnt/pull/196) [`b4214eb`](https://github.com/mmmnt/mmmnt/commit/b4214eb1c21be33f0a5f41803891a0106ef9b1d3) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - String escapes, coverage restored, and the `@hono/node-server` advisory ([#195](https://github.com/mmmnt/mmmnt/issues/195)).

  - core: strings accept backslash escapes, so `\"` can appear inside a string. Values keep quotes that begin or end their content, and the Sift importer escapes every string it writes, so its output parses.
  - core: V12 no longer throws when parser recovery leaves a deprecation without its replacement.
  - cli: `moment reconcile <spec> --event` with no path reports the missing flag instead of crashing.
  - mcp: `@hono/node-server` resolves to 2.x, fixing GHSA-rmxm-3fg6-px4f.

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

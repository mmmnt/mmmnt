# @mmmnt/derive

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.16.0

## 0.15.0

### Patch Changes

- [#236](https://github.com/mmmnt/mmmnt/pull/236) [`c7f6001`](https://github.com/mmmnt/mmmnt/commit/c7f6001899078840d2218d5afcb9e02e41cb6aed) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Derived sample payloads have the formats their types declare, a crossing contract names only fields its event declares, and the cli type-checks.

  - derive: a `UUID` field samples a valid UUID, a version 8 (custom) UUID made from the SHA-256 of the field name. It was `<name>-001`, which a format check of UUIDs rejects. A field has the same UUID in every payload and on every run, so the same model still gives byte-identical scenarios. `DateTime`, `Date` and `Money` samples already had their formats and do not change.
  - core: new rule V58. A crossing's `contract` field that the crossing event does not declare is a warning on a single file and an error over a project, like the other model-level rules. The diagnostic carries `ruleId: 'V58'`.
  - Behaviour change: V58 can turn a project that loaded clean into one that fails. Declare the field on the event, or drop it from the contract.
  - TicketWave's crossings of `PaymentInitiated` and `PaymentConfirmed` now name only fields their events declare.
  - cli: `tsc --noEmit -p packages/cli` passes. The `derive` command read `result.notices`, which `runDerive` never returns; that line is gone and output is unchanged. The cli has a `typecheck` script, so CI's `pnpm turbo typecheck` checks it.

- Updated dependencies [[`98ba180`](https://github.com/mmmnt/mmmnt/commit/98ba180e76b8b6fee2b6c8d4500657e7b2b5f75a), [`c7f6001`](https://github.com/mmmnt/mmmnt/commit/c7f6001899078840d2218d5afcb9e02e41cb6aed)]:
  - @mmmnt/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.14.0

## 0.13.0

### Minor Changes

- [`e39ae92`](https://github.com/mmmnt/mmmnt/commit/e39ae92e0a61b6a6bd55f59ab5a4a4b0a8f681cc) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - A policy condition reads the variant of a tagged union field (ADR-050).

  - derive: the trigger occurrence a declared reaction names carries `<field>: { kind: <Variant> }`; the trigger's other occurrences carry the union's first variant that no guard on the field declares, so they decidably do not meet it. `policy-definitions.json` carries the path as written.

  Not breaking: every model that parsed under 0.12.0 has the same IR, and `parse`, `test`, `derive`, `viz`, `cucumber-json`, `simulate --all`, `generate`, `emit-ts`, `board` and `schema emit` write the same files for TicketWave, every valid fixture and the Sift model copy. A Facet that does not read dotted paths treats the guard as undecidable, so it holds the reaction at every occurrence, as for a policy with no condition.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.13.0

## 0.12.0

### Minor Changes

- [`e9c9266`](https://github.com/mmmnt/mmmnt/commit/e9c9266d3f0dd7adfac7fcd1c330d8b052a29059) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Fields declare optionality, code sets, unions, maps and patterns, and `moment schema emit` writes one closed JSON Schema per event payload (ADR-049).

  - derive: a sample payload takes a code set's first value, `{}` for a map, and only the first member of an exclusive group.

  Not breaking: every model that parsed under 0.11.0 has the same IR, and `parse`, `test`, `simulate --all`, `derive`, `generate` and `emit-ts` write the same files for TicketWave, every valid fixture and the Sift model copy.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.10.1

## 0.10.0

### Minor Changes

- A policy declares the condition under which it reacts, and the branch stamp moves to its own key (ADR-045, ADR-046).

  ADR-045, a policy declares the condition under which it reacts:

  - derive: `policy-definitions.json` entries carry `condition` when declared and nothing otherwise. The scenario generator sets the declared value on the occurrence of the trigger that a declared reaction names (the nearest earlier placement the `triggered-by` link uses) and keeps every other occurrence off that value. `after` needs no generation.

  ADR-046, the branch condition stamp has its own key:

  - derive: the arm a scenario took is written to `payload.$branch` (exported as `BRANCH_KEY`), a key the grammar cannot produce as a field name, and the topology's `branchPredicates[*].field` is `$branch`. `payload.outcome` is still written for an event that declares no `outcome` field, and is no longer written over one that does: a model's own `outcome` keeps its value. Facet reads the arm through the predicate's field, so older artifacts (field `outcome`) read as before.

  Compatibility: golden comparison against the 0.9.0 build on every valid fixture, ticketwave at its 0.9.0 spec and the SAMMI model (simulate, generate, emit-ts, derive, viz, parse). The only differences are an added `"$branch"` line on every event inside an arm and `"field": "outcome"` becoming `"field": "$branch"` in branch predicates; every other output is byte-identical. The specs were verified by reintroducing each defect.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.10.0

## 0.9.0

### Minor Changes

- [`2debed1`](https://github.com/mmmnt/mmmnt/commit/2debed1062f0067d6d30c8c40df10ef4ca02cb5b) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Branch paths: negatives for every path, an arm that ends at an outcome, and the arm a topology connection is declared in (ADR-042, ADR-043, ADR-044).

  ADR-042, negative scenarios for every branch path:

  - derive: `deriveNegativeScenarios` derives over every path `generateAllScenarios` enumerates, with one negative per (command, precondition, cause) not already covered. The first-arm path is derived first, exactly as before, so its scenarios, ids and order are byte-identical. A command placed only in a later arm (a decline, a cancel, a fail, an expire) now has its negatives. An explicit `branchSelections` still walks that one path. Scenario shape, `kind` values and manifest fields are unchanged; there are more `kind: negative` entries.

  ADR-043, an arm may end at an outcome:

  - derive: an arm that ends at `[outcome]` is a `variant` (`Variant: ...`); an arm that ends at `[terminal]` is a `failure`. Label and kind share one rule. `ScenarioKind` has the same five values.

  ADR-044, a topology connection declared inside a `when` arm carries that arm:

  - derive: `TopologyConnection` gains an optional `branchCondition`, the arm's condition as written in the spec (the key `branchPredicates[<frame>].routes` and `activeBranches[].condition` use), copied from the IR for `triggered-by`, `triggers`, `crosses-to` and `returns-to`. A connection declared outside an arm has no such field. Additive: with the keys removed, the topology of every model is byte-identical to 0.8.0's. Ticketwave 10 of 50 connections carry it; SAMMI 16 of 19.

  Compatibility: golden comparison against the build of 0.8.0 on every valid fixture, ticketwave at its previous spec and the SAMMI model. Every old scenario is present and byte-identical; the new build adds only the negatives above; topology differs only by the `branchCondition` keys; every other artifact is byte-identical. The three regression specs were verified by reintroducing each defect.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.9.0

## 0.8.0

### Minor Changes

- A command records one or more events: events recorded together, and alternative outcomes chosen by state (ADR-041).

  Artifacts:

  - derive: the scenario for a multi-event command shows the command step, then the events the flow places for one outcome, contiguous and in declared order, each caused by the command step alone and carrying its timestamp. A scenario that reaches a guarded outcome names the state in its `when` and in the command step's payload (`whenState`). A rejection records no event of any outcome. The event catalog has an entry per event whose producer is the command, with `recordedWith` and `alternativeTo` (absent for a single-event command). Impact analysis links the command to every event of every outcome, in both directions. Topology is unchanged.

  Compatibility: every model that parses today parses with an identical IR and identical derived artifacts. This was checked on every valid fixture, the rule ids of every invalid fixture, ticketwave at its previous spec and the SAMMI model, against the build of 0.7.2, and the comparison fails on a build that writes `outcomes` for a plain `emits`. The ticketwave example now uses the new forms (`HoldClosed` recorded with `HoldConvertedToReservation`; `AccessCodeExhausted` on the last use of an access code) and its facet files are regenerated, so its scenarios and tests change.

### Patch Changes

- derive: node ids are unique within a topology. The first placement of a name in a moment, lane and scope keeps its id; a later one adds an occurrence mark (`<moment>::<lane>::<name>::main#2`, `…::br0#2`), so a moment that places the same node twice no longer fails Facet's "Duplicate node ID". Topology frames, event routing, scenario `payload.nodeId` and `expectedPath` use the same id. Output for a model with no repeated placement is unchanged.

- Updated dependencies []:
  - @mmmnt/core@0.8.0

## 0.7.2

### Patch Changes

- Audit fixes and corrections to the 0.7.0 notes.

  - **Correction to the 0.7.0 notes: derived topology.** A placed policy is now routed in the topology by its own name, and an orchestration command is typed and routed as `SimProcess.<Name>`. The `eventRouting` of every model that places a policy gains those entries, so a regenerated topology differs from one derived with 0.6.x.

- Updated dependencies []:
  - @mmmnt/core@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.7.1

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

### Patch Changes

- Updated dependencies [`550a2b6`]:
  - @mmmnt/core@0.7.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`b4214eb`](https://github.com/mmmnt/mmmnt/commit/b4214eb1c21be33f0a5f41803891a0106ef9b1d3)]:
  - @mmmnt/core@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`f2741d5`](https://github.com/mmmnt/mmmnt/commit/f2741d5858721c2bed74b6d99db0d80af1cebd9d), [`a80df89`](https://github.com/mmmnt/mmmnt/commit/a80df89f2a773f1642fdc3781f88ab4580ea944b)]:
  - @mmmnt/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f), [`a06ff54`](https://github.com/mmmnt/mmmnt/commit/a06ff54321599311357388d513e372246e31ccad), [`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f), [`160323b`](https://github.com/mmmnt/mmmnt/commit/160323b7001dc079e8136703a516bc150a8541c0)]:
  - @mmmnt/core@0.6.0

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

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`560b5dd`](https://github.com/mmmnt/mmmnt/commit/560b5ddbce4a9bcbdbb96bef5458ac90df60bc52), [`a3581a8`](https://github.com/mmmnt/mmmnt/commit/a3581a884974e546497750d95db745abf37f181e)]:
  - @mmmnt/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`5d4f13e`](https://github.com/mmmnt/mmmnt/commit/5d4f13e7ca741c2f41a9ee93335b6842673632e0)]:
  - @mmmnt/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.3.0

## 0.2.0

### Minor Changes

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

- 6e7d6ed: **fix(derive): topology routing and saga state machine output**
  - Align scenario node IDs with the topology's node ID scheme so cross-references
    resolve correctly when consumers join scenarios to topology nodes.
  - Fix topology routing so connections traverse the correct edges, and correct
    the saga state machine emitter output shape.

- Updated dependencies [6e7d6ed]
  - @mmmnt/core@0.2.0

## 0.1.1

### Patch Changes

- [`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f) Thanks [@claude](https://github.com/claude)! - Updated package metadata: license field (FSL-1.1-Apache-2.0), author, exports, sideEffects, keywords, descriptions, and comprehensive READMEs for all packages.

- Updated dependencies [[`699fc0d`](https://github.com/mmmnt/mmmnt/commit/699fc0d7e68a96a9aefce704710cd4369be0919f)]:
  - @mmmnt/core@0.1.1

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

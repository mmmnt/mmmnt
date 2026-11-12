# @mmmnt/cli

## 0.11.0

### Minor Changes

- [`988be77`](https://github.com/mmmnt/mmmnt/commit/988be77d9f1d68acec0a0f3b0a023a5f423798f0) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Add `@mmmnt/board` and `moment board` (ADR-047, ADR-048). The package projects a parsed model (its IR, not the `.moment` text) onto a numbered board that follows the Sift reference execution: a generated Legend and Grammar, a Context Map, a caption frame per context, a frame per aggregate, a Services frame, Projection & Query, Policies, Invariant Coverage and a thread frame per flow, placed on a deterministic grid (`board.svg` plus one SVG per frame) with native stickies in the nearest named colour and the exact hexes printed in the Legend. A thread has moments as numbered columns, a SYSTEM stack, a BRANCH row of refusals with a table of arms, a terminal banner and continued columns; cause, condition, process owner and alternative emits are written into the sticky. `manifest.json` lists every node with its kind, name, context, flow, moment id, arm and a stable key, and every frame with its number and placement, so a board can be compared with a board of record. Flows are numbered by an id token in the flow name (`N1 - Title`); an unnumbered flow fails `moment board` with exit 1. Context numbers come from a name token, the order of `manifest.yaml`, or the load order. `--pointers <file>` adds spec pointers from a sidecar. A closure sweep over the IR fails when a property is neither carried nor listed as unrendered with a reason. No grammar, IR or existing output changes.

### Patch Changes

- fix(board): commandText takes outcomes by destructuring so the ADR-041 sweep finds no direct read
- Updated dependencies [[`988be77`](https://github.com/mmmnt/mmmnt/commit/988be77d9f1d68acec0a0f3b0a023a5f423798f0)]:
  - @mmmnt/board@0.11.0
  - @mmmnt/core@0.11.0
  - @mmmnt/derive@0.11.0
  - @mmmnt/emit-ts@0.11.0
  - @mmmnt/generate@0.11.0
  - @mmmnt/harness@0.11.0
  - @mmmnt/schema@0.11.0
  - @mmmnt/sync@0.11.0
  - @mmmnt/viz@0.11.0

## 0.10.1

### Patch Changes

- Project mode no longer reports a per-file V49, V50 or V51 that the merged project does not report (ADR-045).

  - core: `ProjectLoader` drops a per-file diagnostic only for the rules the merged validation re-checks, and matched V22 to V48. A policy `trigger X after Y` in one context file, with `Y` declared in another file, got a spurious V50 in `moment parse <dir>`. Every rule from V22 on is now treated as checked over the merge, so a rule added later needs no change here.

- Updated dependencies []:
  - @mmmnt/core@0.10.1
  - @mmmnt/derive@0.10.1
  - @mmmnt/emit-ts@0.10.1
  - @mmmnt/generate@0.10.1
  - @mmmnt/harness@0.10.1
  - @mmmnt/schema@0.10.1
  - @mmmnt/sync@0.10.1
  - @mmmnt/viz@0.10.1

## 0.10.0

### Minor Changes

- A policy declares the condition under which it reacts, and the branch stamp moves to its own key (ADR-045, ADR-046).

  ADR-045, a policy declares the condition under which it reacts:

  - core: `trigger E when <field> = <value>` and `trigger E after <Event>` on a policy, in that order, either or both. `=` is a new token and `after` a new keyword, escaped in `FieldName` and `LaneName` so a field, lane or input named `after` still parses. The IR's `PolicyDefinition` gains an optional `condition` (`field` and `equals`, and/or `after`); a policy that declares none has no such key. New rules: V49 (a `when` field the trigger does not carry), V50 (an `after` event that is not declared), V51 (an advisory: no flow places the `after` event before the trigger). A guard on a field named `outcome` is allowed.
  - derive: `policy-definitions.json` entries carry `condition` when declared and nothing otherwise. The scenario generator sets the declared value on the occurrence of the trigger that a declared reaction names (the nearest earlier placement the `triggered-by` link uses) and keeps every other occurrence off that value. `after` needs no generation.
  - Ticketwave: `PromoteWaitlistOnRelease when reason = expired`, `ConvertHoldOnPayment after SeatsHeld`, and a flow `hold-release` that places `HoldReleased` twice.

  ADR-046, the branch condition stamp has its own key:

  - derive: the arm a scenario took is written to `payload.$branch` (exported as `BRANCH_KEY`), a key the grammar cannot produce as a field name, and the topology's `branchPredicates[*].field` is `$branch`. `payload.outcome` is still written for an event that declares no `outcome` field, and is no longer written over one that does: a model's own `outcome` keeps its value. Facet reads the arm through the predicate's field, so older artifacts (field `outcome`) read as before.
  - Ticketwave: a flow `waitlist-offer` whose events and command declare their own `outcome`.

  Ticketwave facet files are regenerated: 8 flows, 72 scenarios.

  Compatibility: golden comparison against the 0.9.0 build on every valid fixture, ticketwave at its 0.9.0 spec and the SAMMI model (simulate, generate, emit-ts, derive, viz, parse). The only differences are an added `"$branch"` line on every event inside an arm and `"field": "outcome"` becoming `"field": "$branch"` in branch predicates; every other output is byte-identical. The specs were verified by reintroducing each defect.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.10.0
  - @mmmnt/derive@0.10.0
  - @mmmnt/emit-ts@0.10.0
  - @mmmnt/generate@0.10.0
  - @mmmnt/harness@0.10.0
  - @mmmnt/schema@0.10.0
  - @mmmnt/sync@0.10.0
  - @mmmnt/viz@0.10.0

## 0.9.0

### Minor Changes

- [`2debed1`](https://github.com/mmmnt/mmmnt/commit/2debed1062f0067d6d30c8c40df10ef4ca02cb5b) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Branch paths: negatives for every path, an arm that ends at an outcome, and the arm a topology connection is declared in (ADR-042, ADR-043, ADR-044).

  ADR-042, negative scenarios for every branch path:

  - derive: `deriveNegativeScenarios` derives over every path `generateAllScenarios` enumerates, with one negative per (command, precondition, cause) not already covered. The first-arm path is derived first, exactly as before, so its scenarios, ids and order are byte-identical. A command placed only in a later arm (a decline, a cancel, a fail, an expire) now has its negatives. An explicit `branchSelections` still walks that one path. Scenario shape, `kind` values and manifest fields are unchanged; there are more `kind: negative` entries.
  - Ticketwave: 36 negatives become 39 (`FailPayment.paymentPending`, `DeclineTransfer.transferPending`, `CancelTransfer.transferPending`). SAMMI: every existing scenario byte-identical, and one is added (`RecordSessionLoss.WasConnected`, placed only in an arm of T7).

  ADR-043, an arm may end at an outcome:

  - core: a second exit modifier, `[outcome]`. It sets `terminal: true` and `exit: 'outcome'` on the IR entry, so everything that stops at a terminal behaves the same. `[terminal]` is unchanged and stays a failure exit. `outcome` is a keyword inside the modifier brackets and is escaped in `FieldName` and `LaneName` (and so in input names), so a field, lane or input named `outcome` still parses. V8 (a terminal is the last node of its block) holds for `[outcome]` too.
  - derive: an arm that ends at `[outcome]` is a `variant` (`Variant: ...`); an arm that ends at `[terminal]` is a `failure`. Label and kind share one rule. `ScenarioKind` has the same five values.
  - generate: Gherkin writes `(outcome)` for `(terminal)`, tags the arm `@terminal @alt-path` (not `@failure-path`), ends it with `the flow ends at <node>`, and attributes no failed precondition to it. The specification document writes `flow ends at` with a check mark, and the sequence diagram closes the arm with `Flow ends at an outcome`.
  - Syntax files (core and vscode) know the new word. A model that does not use `[outcome]` has a byte-identical IR and derived output.

  ADR-044, a topology connection declared inside a `when` arm carries that arm:

  - derive: `TopologyConnection` gains an optional `branchCondition`, the arm's condition as written in the spec (the key `branchPredicates[<frame>].routes` and `activeBranches[].condition` use), copied from the IR for `triggered-by`, `triggers`, `crosses-to` and `returns-to`. A connection declared outside an arm has no such field. Additive: with the keys removed, the topology of every model is byte-identical to 0.8.0's. Ticketwave 10 of 50 connections carry it; SAMMI 16 of 19.

  Ticketwave: new flows `seat-request` and `payment-settlement` show the three changes (a refusal in a later arm, `[outcome]` exits, and two arms that declare the same conversion differently). Its facet files are regenerated: 6 flows, 67 scenarios.

  Compatibility: golden comparison against the build of 0.8.0 on every valid fixture, ticketwave at its previous spec and the SAMMI model. Every old scenario is present and byte-identical; the new build adds only the negatives above; topology differs only by the `branchCondition` keys; every other artifact is byte-identical. The three regression specs were verified by reintroducing each defect.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.9.0
  - @mmmnt/derive@0.9.0
  - @mmmnt/emit-ts@0.9.0
  - @mmmnt/generate@0.9.0
  - @mmmnt/harness@0.9.0
  - @mmmnt/schema@0.9.0
  - @mmmnt/sync@0.9.0
  - @mmmnt/viz@0.9.0

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

  Artifacts:

  - derive: the scenario for a multi-event command shows the command step, then the events the flow places for one outcome, contiguous and in declared order, each caused by the command step alone and carrying its timestamp. A scenario that reaches a guarded outcome names the state in its `when` and in the command step's payload (`whenState`). A rejection records no event of any outcome. The event catalog has an entry per event whose producer is the command, with `recordedWith` and `alternativeTo` (absent for a single-event command). Impact analysis links the command to every event of every outcome, in both directions. Topology is unchanged.
  - emit-ts: a handler returns the event for `emits A`, `readonly [A, B]` for events recorded together, `A | B` for alternatives, `readonly [A, B] | C` for both; the JSDoc has one `@emits` per event and `@outcome <State>: <events>` per guarded outcome.
  - generate: Gherkin writes the events recorded after the first as `And ... emits`; the specification document writes `produces A, B`, `produces A or B`, and `produces A when S, or A, B when T` in the narrative, the command table and the sequence diagram.
  - viz, mcp, cli: no change (pinned by tests).

  Compatibility: every model that parses today parses with an identical IR and identical derived artifacts. This was checked on every valid fixture, the rule ids of every invalid fixture, ticketwave at its previous spec and the SAMMI model, against the build of 0.7.2, and the comparison fails on a build that writes `outcomes` for a plain `emits`. The ticketwave example now uses the new forms (`HoldClosed` recorded with `HoldConvertedToReservation`; `AccessCodeExhausted` on the last use of an access code) and its facet files are regenerated, so its scenarios and tests change.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.8.0
  - @mmmnt/derive@0.8.0
  - @mmmnt/emit-ts@0.8.0
  - @mmmnt/generate@0.8.0
  - @mmmnt/harness@0.8.0
  - @mmmnt/schema@0.8.0
  - @mmmnt/sync@0.8.0
  - @mmmnt/viz@0.8.0

- derive: node ids are unique within a topology. The first placement of a name in a moment, lane and scope keeps its id; a later one adds an occurrence mark (`<moment>::<lane>::<name>::main#2`, `…::br0#2`), so a moment that places the same node twice no longer fails Facet's "Duplicate node ID". Topology frames, event routing, scenario `payload.nodeId` and `expectedPath` use the same id. Output for a model with no repeated placement is unchanged.

## 0.7.2

### Patch Changes

- Audit fixes and corrections to the 0.7.0 notes.

  - **V43 is an error in a single file when the file can decide.** A same-moment `triggered-by` must be a hop a policy declares. When the node is a policy (event -> policy) or the cause is a policy (policy -> command), the supporting declaration is that policy's own, so a file that declares the policy now fails with V43 instead of passing with a warning. When the hop is event -> command, the supporting policy may be declared in another file, so V43 stays an advisory per file; over a merged project it is always an error. This restores the guarantee V5 gave before it was relaxed, without needing the whole project when the file already holds the answer.
  - **V5 keeps its safe default.** A `triggered-by` check on a node that its moment does not hold sees no earlier siblings, rather than all but the last. The V43 message names the moment from the flow's own moment list.
  - **Two fixtures no longer end on a `[terminal]` that no rule needed.** `fixtures/valid/process-constructs` and `fixtures/valid/model-completeness` return to their original last node.
  - **Vet-clinic names removed from the ADR-040 tests, fixtures and the DSL page**, re-themed to ticketwave. The ADR-040 document now names the real `*-adr040.spec.ts` files and no longer carries a stray field, an invalid `timeout "48h"` or a leftover flow name.
  - **Correction to the 0.7.0 notes.** `causes`, as well as `note` and `cause`, became a keyword: a node (command, event, policy and so on) named `causes` no longer parses. Lane names and field names are unaffected.
  - **Correction to the 0.7.0 notes: derived topology.** A placed policy is now routed in the topology by its own name, and an orchestration command is typed and routed as `SimProcess.<Name>`. The `eventRouting` of every model that places a policy gains those entries, so a regenerated topology differs from one derived with 0.6.x.

- Updated dependencies []:
  - @mmmnt/core@0.7.2
  - @mmmnt/derive@0.7.2
  - @mmmnt/emit-ts@0.7.2
  - @mmmnt/generate@0.7.2
  - @mmmnt/harness@0.7.2
  - @mmmnt/schema@0.7.2
  - @mmmnt/sync@0.7.2
  - @mmmnt/viz@0.7.2

## 0.7.1

### Patch Changes

- `moment serve` sends Facet everything `moment simulate --all --out-dir` writes.

  - cli: `serve --all` includes the saga-timeout scenarios. A project with sagas showed 48 of ticketwave's 50 scenarios live.
  - cli: `serve` sends the policy definitions in both the spec and the facet-directory pipelines, so Facet's policy tier runs in live mode.
  - The vet-clinic fixture is removed; tests, the e2e harness and the install smoke test run against the ticketwave example, and the harness no longer writes generated output into the repository root.

- Updated dependencies []:
  - @mmmnt/core@0.7.1
  - @mmmnt/derive@0.7.1
  - @mmmnt/emit-ts@0.7.1
  - @mmmnt/generate@0.7.1
  - @mmmnt/harness@0.7.1
  - @mmmnt/schema@0.7.1
  - @mmmnt/sync@0.7.1
  - @mmmnt/viz@0.7.1

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
  - @mmmnt/derive@0.7.0
  - @mmmnt/generate@0.7.0
  - @mmmnt/emit-ts@0.7.0
  - @mmmnt/viz@0.7.0
  - @mmmnt/harness@0.7.0
  - @mmmnt/schema@0.7.0
  - @mmmnt/sync@0.7.0

## 0.6.2

### Patch Changes

- [#196](https://github.com/mmmnt/mmmnt/pull/196) [`b4214eb`](https://github.com/mmmnt/mmmnt/commit/b4214eb1c21be33f0a5f41803891a0106ef9b1d3) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - String escapes, coverage restored, and the `@hono/node-server` advisory ([#195](https://github.com/mmmnt/mmmnt/issues/195)).

  - core: strings accept backslash escapes, so `\"` can appear inside a string. Values keep quotes that begin or end their content, and the Sift importer escapes every string it writes, so its output parses.
  - core: V12 no longer throws when parser recovery leaves a deprecation without its replacement.
  - cli: `moment reconcile <spec> --event` with no path reports the missing flag instead of crashing.
  - mcp: `@hono/node-server` resolves to 2.x, fixing GHSA-rmxm-3fg6-px4f.

- Updated dependencies [[`b4214eb`](https://github.com/mmmnt/mmmnt/commit/b4214eb1c21be33f0a5f41803891a0106ef9b1d3)]:
  - @mmmnt/core@0.6.2
  - @mmmnt/derive@0.6.2
  - @mmmnt/emit-ts@0.6.2
  - @mmmnt/generate@0.6.2
  - @mmmnt/harness@0.6.2
  - @mmmnt/schema@0.6.2
  - @mmmnt/viz@0.6.2
  - @mmmnt/sync@0.6.2

## 0.6.1

### Patch Changes

- [#191](https://github.com/mmmnt/mmmnt/pull/191) [`f2741d5`](https://github.com/mmmnt/mmmnt/commit/f2741d5858721c2bed74b6d99db0d80af1cebd9d) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Refresh dependencies within their existing ranges. `@mmmnt/cli` picks up `ws` 8.22, which clears its high-severity advisory.

- Updated dependencies [[`f2741d5`](https://github.com/mmmnt/mmmnt/commit/f2741d5858721c2bed74b6d99db0d80af1cebd9d), [`a80df89`](https://github.com/mmmnt/mmmnt/commit/a80df89f2a773f1642fdc3781f88ab4580ea944b)]:
  - @mmmnt/core@0.6.1
  - @mmmnt/generate@0.6.1
  - @mmmnt/sync@0.6.1
  - @mmmnt/derive@0.6.1
  - @mmmnt/emit-ts@0.6.1
  - @mmmnt/harness@0.6.1
  - @mmmnt/schema@0.6.1
  - @mmmnt/viz@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [[`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f), [`a06ff54`](https://github.com/mmmnt/mmmnt/commit/a06ff54321599311357388d513e372246e31ccad), [`e5b7fc1`](https://github.com/mmmnt/mmmnt/commit/e5b7fc194063043441f19c1ebbfa393f8112b52f), [`160323b`](https://github.com/mmmnt/mmmnt/commit/160323b7001dc079e8136703a516bc150a8541c0)]:
  - @mmmnt/core@0.6.0
  - @mmmnt/derive@0.6.0
  - @mmmnt/emit-ts@0.6.0
  - @mmmnt/generate@0.6.0
  - @mmmnt/harness@0.6.0
  - @mmmnt/schema@0.6.0
  - @mmmnt/viz@0.6.0
  - @mmmnt/sync@0.6.0

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
  - @mmmnt/derive@0.5.0
  - @mmmnt/generate@0.5.0
  - @mmmnt/emit-ts@0.5.0
  - @mmmnt/harness@0.5.0
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
  - @mmmnt/harness@0.4.0
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
  - @mmmnt/harness@0.3.1
  - @mmmnt/schema@0.3.1
  - @mmmnt/viz@0.3.1
  - @mmmnt/sync@0.3.1

## 0.3.0

### Minor Changes

- [#139](https://github.com/mmmnt/mmmnt/pull/139) [`5748942`](https://github.com/mmmnt/mmmnt/commit/5748942870c2ddb16dc835b7bf7ff9d93b64d93f) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - **feat(cli): `moment serve` accepts a facet directory**

  `moment serve` now accepts either a `.moment` spec file (live-derive, as
  before) or a directory of pre-built artifacts written by
  `moment simulate --out-dir <dir> --all` (new). This decouples scenario
  bake from the live bridge, so a single baked directory can drive Facet
  over the same WebSocket protocol without re-parsing the spec on every
  connect.

  ```bash
  # Bake once
  moment simulate .moment/flows/order-placed.moment --all --out-dir .facet

  # Serve many times, with or without negative scenarios
  moment serve .facet          # happy-path scenarios only
  moment serve .facet --all    # every scenario (happy + negatives)
  ```

  **Directory mode is manifest-driven.** `serve` reads
  `<dir>/manifest.json` as the authoritative index of flows → topology +
  scenarios + artifacts. No filename globbing, no guessing. Fails fast
  with an actionable error if the manifest is missing or malformed:

  ```
  Initial pipeline failed: Facet directory is missing manifest.json at
  /path/to/.facet/manifest.json. Run `moment simulate <spec.moment>
  --out-dir /path/to/.facet --all` to populate it.
  ```

  **`--all` has different semantics in directory mode.** At bake time
  (`simulate --all`) it means "write every branch combination + every
  negative scenario to disk". At serve time over a pre-built directory,
  it's a filter against the manifest's `isHappyPath`/`isNegative` flags —
  default serves happy-path only, `--all` serves everything. One baked
  directory can power both a clean demo and a "show the failure modes"
  view without rebaking.

  The WebSocket payload shape is identical between live-derive and
  directory modes — Facet sees the same `WsInitialLoad` / `WsTopologyUpdate`
  / `WsScenarioUpdate` / `WsArtifactUpdate` messages regardless of source.
  Directory mode's watcher re-reads on any `.json` change (debounced
  300ms) so re-running `simulate --out-dir` live-updates connected
  clients.

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.3.0
  - @mmmnt/derive@0.3.0
  - @mmmnt/emit-ts@0.3.0
  - @mmmnt/generate@0.3.0
  - @mmmnt/harness@0.3.0
  - @mmmnt/schema@0.3.0
  - @mmmnt/sync@0.3.0
  - @mmmnt/viz@0.3.0

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

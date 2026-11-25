# @mmmnt/emit-ts

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @mmmnt/core@0.16.0
  - @mmmnt/derive@0.16.0

## 0.15.0

### Minor Changes

- [#229](https://github.com/mmmnt/mmmnt/pull/229) [`8600af1`](https://github.com/mmmnt/mmmnt/commit/8600af17174e0b48c8f8b853a874f7a64d0768a0) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - The TypeScript that `emit-ts` writes type-checks on its own under `tsc --strict`.

  - emit-ts: `DateTime` is written as `string` and `Money` as `number`, the type of the value an event records, as `UUID` already was and as `moment schema emit` writes them. No emitted file named `DateTime` or `Money` without declaring it.
  - emit-ts: `Date` is written as `string`, an ISO 8601 date (`2026-11-24`), as `moment schema emit` records it and as derive samples it. It was the JavaScript `Date` object type, which no JSON payload carries.
  - emit-ts: a types, aggregate, read-model or process file imports each declared type it names from the file that declares it, with `import type` and a relative path: another aggregate's file, the context's `read-model.types.ts`, or a file of another context. The context's own files come first.
  - emit-ts: when two files of a context, or two contexts, declare the same name, the barrel re-exports it from the first, so `export *` no longer drops it. At `aggregate` scope the context barrel no longer re-exports a `read-model.types.ts` it does not emit.

  Breaking for code that passes a JavaScript `Date` into a generated `Date` field: pass the ISO date string instead (`d.toISOString().slice(0, 10)`). Otherwise not breaking for code that compiled before: a field that was `DateTime` or `Money` is now `string` or `number`, which is what the name stood for, and every other change adds an import or an export. TicketWave and every model in `fixtures/valid` compile with no diagnostics, and a spec checks it.

### Patch Changes

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

### Minor Changes

- [`e9c9266`](https://github.com/mmmnt/mmmnt/commit/e9c9266d3f0dd7adfac7fcd1c330d8b052a29059) Thanks [@listenrightmeow](https://github.com/listenrightmeow)! - Fields declare optionality, code sets, unions, maps and patterns, and `moment schema emit` writes one closed JSON Schema per event payload (ADR-049).

  - emit-ts: a code set is a union of string literals, a map `Readonly<Record<string, T>>`, a scalar value object a type alias and a union a discriminated union on `kind`.

  Not breaking: every model that parsed under 0.11.0 has the same IR, and `parse`, `test`, `simulate --all`, `derive`, `generate` and `emit-ts` write the same files for TicketWave, every valid fixture and the Sift model copy.

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

### Minor Changes

- A command records one or more events: events recorded together, and alternative outcomes chosen by state (ADR-041).

  Artifacts:

  - emit-ts: a handler returns the event for `emits A`, `readonly [A, B]` for events recorded together, `A | B` for alternatives, `readonly [A, B] | C` for both; the JSDoc has one `@emits` per event and `@outcome <State>: <events>` per guarded outcome.

  Compatibility: every model that parses today parses with an identical IR and identical derived artifacts. This was checked on every valid fixture, the rule ids of every invalid fixture, ticketwave at its previous spec and the SAMMI model, against the build of 0.7.2, and the comparison fails on a build that writes `outcomes` for a plain `emits`. The ticketwave example now uses the new forms (`HoldClosed` recorded with `HoldConvertedToReservation`; `AccessCodeExhausted` on the last use of an access code) and its facet files are regenerated, so its scenarios and tests change.

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

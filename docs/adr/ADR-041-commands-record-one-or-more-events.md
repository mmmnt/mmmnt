# ADR-041: A command records one or more events: events recorded together, and alternative outcomes chosen by state

- **Status:** Accepted (founder, 2026-11-05). Ruling, verbatim: "Approve, build it".
- **Date:** 2026-11-05
- **Supersedes:** nothing. Amends ADR-038 section 2 (orchestration command `emits`), ADR-040 D1 (V31 wording) and validation rule V38.
- **Founder ruling (2026-11-05, verbatim):** "Moment matches the palette"
- **Founder rulings on the open questions (2026-11-05, verbatim):** "Include it now" (the `when <State>` guard, with V46, is in scope); "In ticketwave itself" (the multi-event examples live in `examples/ticketwave/spec/ticketwave.moment`, not in a separate fixture; this overrules the draft's separate fixture and open question 4).
- **Released as:** 0.8.0, a minor release of the fixed `@mmmnt/*` group.
- **Numbering:** `docs/adr/` on `origin/main` holds ADR-040 as its only file; this takes the next number, 041.
- **Source read:** `origin/main` of the moment repository (grammar `packages/core/src/grammar/moment.langium`, IR `packages/core/src/ir/context-definition.ts`, every consumer of `emits` / `emitsEvent` under `packages/`, ADR-040 and `docs/palette-delta-040.md`). The ticketwave spec is `examples/ticketwave/spec/ticketwave.moment`.

## Context

The project's DDD palette (Methodology section 2a) defines a command this way:

> A command "targets exactly one aggregate root, produces event(s) or a rejection."
> The command flow is "Command → Aggregate → validate invariants → Event(s), or rejection with NO event", and "one command → one aggregate → one transaction".
> A saga is a "multi-step cross-aggregate/context workflow with state + compensation".

The palette says "event(s)". Moment says one. The grammar admits exactly one `emits` per command:

```
CommandDeclaration:      'command' name=ID ... preconditions+=Precondition* 'emits' emits=ID;
OrchestrationCommand:    'command' name=ID ... preconditions+=Precondition* ('emits' emits=ID)?;
```

and the IR carries a scalar: `CommandDefinition.emitsEvent: string`, `OrchestrationCommandDefinition.emitsEvent?: string`. Moment is narrower than its own palette. The founder has ruled that Moment matches the palette. The palette's wording gives two things the language cannot say today.

### 1. Events recorded together (the transaction records several facts)

One command, one aggregate, one transaction. Inside that transaction the aggregate may record more than one fact, and all of them are true or none is. The facts are the aggregate's own, and each one is something a different consumer cares about.

Ticketwave has a clean case inside one aggregate. `SeatHold.ConvertHoldToReservation` turns a hold into a reservation. The hold's lifecycle ends in the same step: the hold is closed. Today the spec declares only `HoldConvertedToReservation`, and the end of the hold's life is a second hop: the policy `CloseHoldOnConversion` reacts to the event and chains to the `SeatHoldLifecycle` command `CloseHold`. That hop is right for what the orchestration decides. It is wrong as the only way to say that the aggregate itself closed the hold when it converted it, because a consumer of "hold closed" cannot tell whether that fact was recorded atomically with the conversion or whenever the policy got round to it.

A note on the case the drafting brief reached for first, payment confirmation releasing a hold. In ticketwave that crosses an aggregate boundary: `ConfirmPayment` belongs to `Payment` in the Checkout context, and the hold belongs to `SeatHold` in the Inventory context. The spec already models it correctly as the policy `ConvertHoldOnPayment` (`trigger PaymentConfirmed`, `chains-to ConvertHoldToReservation`). Under the palette ("one command → one aggregate → one transaction") that case stays a policy; this ADR does not turn it into a multi-event command. Only facts that the same aggregate records in the same transaction belong in one `emits`.

### 2. Alternative outcomes (the state decides which fact is recorded)

A command may have more than one possible outcome event, and the aggregate's state when the command arrives decides which. Nothing is rejected; the command succeeds either way, with a different fact. The palette's "event(s) or a rejection" lets a command end in an event, and a refusal is already modelled as a precondition. An alternative outcome is not a refusal: both outcomes are successes the business names differently.

Plausible ticketwave case (the spec did not declare it before this ADR; ticketwave itself now does): `AccessCode.RedeemAccessCode`. Redeeming a code that has uses left records `AccessCodeRedeemed`. Redeeming the last use records `AccessCodeRedeemed` and `AccessCodeExhausted` together, so the presale context stops accepting the code without a second command. Which one happens depends on the code's state (`Open` or `OneUseLeft`). This case uses both shapes at once.

### 3. Why the language must say it

Authors cannot declare today what the palette allows. They pick among three bad options:

1. Declare only the first fact and leave the other to a policy. The model then says the second fact happens later and separately, which is false when the aggregate records it in the same transaction, and the consumer-facing guarantee (atomicity) is lost.
2. Split the command in two (rejected below).
3. Leave the second fact out of the model, so its consumers have nothing to subscribe to.

The simulation also has a need. It derives a scenario's event stream from the nodes a flow places. It must know, for a multi-event command, which events the scenario's node shows and which are impossible together.

## Decision

A command declares its outcomes. An outcome is one or more events recorded together. A command with several outcomes records exactly one of them, chosen by the aggregate's state. The single-event form is the one-outcome, one-event case and is unchanged.

### D1. Syntax

```
EmitsClause:  'emits' outcomes+=EmitOutcome ('|' outcomes+=EmitOutcome)*;
EmitOutcome:  events+=ID (',' events+=ID)* ('when' state=ID)?;

CommandDeclaration:   ... preconditions+=Precondition* emits=EmitsClause;
OrchestrationCommand: ... preconditions+=Precondition* (emits=EmitsClause)?;
```

Two operators, with two different meanings, and no new keyword (`when` is already a keyword in moments; here it follows an event list and cannot start a command, event, policy or placement, so the position is unambiguous):

| Written | Reads as | Shape |
|---|---|---|
| `emits A` | records A | today's form, unchanged |
| `emits A, B` | records A **and** B in one transaction | (a) |
| `emits A \| B` | records **either** A **or** B, by state | (b) |
| `emits A, B when S \| C when T` | in state S records A and B together; in state T records C | (a) inside (b) |

`,` binds tighter than `|`. A `when <State>` clause belongs to the outcome (the comma group) it follows.

Examples (ticketwave):

```
aggregate "SeatHold"
  identity holdId: UUID
  command ConvertHoldToReservation
    input holdId: UUID, paymentConfirmationId: UUID
    precondition holdActive: "Hold must be active"
    emits HoldConvertedToReservation, HoldClosed

aggregate "AccessCode"
  identity codeId: UUID
  state initial Open
  state Open -> OneUseLeft on RecordUse
  command RedeemAccessCode
    input codeId: UUID, code: string, customerId: UUID, eventId: UUID
    precondition codeValid: "Access code must be valid and unredeemed"
    emits AccessCodeRedeemed when Open
        | AccessCodeRedeemed, AccessCodeExhausted when OneUseLeft
```

The second example shows the form, with one wrinkle the founder should see: `AccessCodeRedeemed` appears in both outcomes. That is legal (an event may belong to several outcomes of one command; it may not repeat inside one outcome, V45).

### D2. Does shape (b) need distinct syntax from shape (a)?

Yes. The two shapes make different promises, and the simulation and every consumer must be able to tell them apart without inspecting the flow.

- `A, B` is a conjunction. If the command succeeds, every event in the group is in the stream, in declared order.
- `A | B` is a disjunction. If the command succeeds, exactly one outcome is in the stream; the others are impossible in the same run.

Considered and rejected for (b):

| Option | Why not |
|---|---|
| One list, `emits A, B`, with the reader guessing "all or one" from context | The two shapes are opposite promises. A reader, a validator and the simulation cannot guess. |
| A separate keyword, e.g. `emits-one-of A, B` | A second keyword for the same clause fragments the grammar; the outcome group (`A, B`) would have no form inside it. The `|` already reads in Event Storming and DDD notation as "alternatively", and one clause that composes (`A, B \| C`) is smaller than two keywords. |
| A `when` per event, `emits A when S, B when T` | It attaches the guard to the event, which cannot express "A and B together in S, C in T": the guard belongs to the outcome (the transaction), not to the event. It also lets two events with guards look like a conjunction. |
| A free-form guard (an expression over the payload or state) | Moment has no expression language; ADR-040 rejected payload predicates (its alternative 4) for the same reason. A guard here is a **name of a declared aggregate state**, as a `cause` is a name. |

The `when <State>` guard is optional and names a state the owning aggregate declares (`state` declarations, ADR-038 section 3) or, for an orchestration command, a state it declares in `states`. It records what decides the outcome without an expression. Absent, the alternatives are still exclusive, but the model does not say what chooses between them; the validator reports that as advisory (V46).

### D3. IR

All new fields are optional, so IR written before this ADR and single-event models are unchanged.

```ts
export interface EmitOutcomeDefinition {
  /** Events recorded together in one transaction, in declared order (length 1 or more). */
  events: string[];
  /** The aggregate (or orchestration) state in which this outcome is recorded; absent when none is declared. */
  whenState?: string;
}

interface CommandDefinition {
  emitsEvent: string;                  // KEPT: the first event of the first outcome (the only event, for today's form)
  outcomes?: EmitOutcomeDefinition[];  // NEW: present only when the clause is not the plain single form
}

interface OrchestrationCommandDefinition {
  emitsEvent?: string;                 // KEPT: same rule
  outcomes?: EmitOutcomeDefinition[];  // NEW
}
```

Rules for the parser and for every consumer:

- A plain `emits A` produces **no** `outcomes` field. The IR for every model that parses today is byte-identical.
- Any other clause produces `outcomes` (all alternatives, in declared order) and sets `emitsEvent` to the first event of the first outcome, so a consumer that has not been updated reads a real event of the command and keeps working.
- A shared helper in `@mmmnt/core`, `emittedEvents(cmd): string[]`, returns every distinct event the command can record, in declaration order (`[emitsEvent]` when `outcomes` is absent, and `[]` for an orchestration command that emits nothing). A second helper, `emitOutcomes(cmd): EmitOutcomeDefinition[]`, returns `outcomes`, or the one-event outcome built from `emitsEvent`, or `[]`. No consumer reads `emitsEvent` or `outcomes` directly after this ADR; this removes the need to rediscover the compat rule in each package.
- Hand-built IR that sets only `emitsEvent` is read as the single outcome, so it keeps working.

### D4. Validation

| Rule | Before | After |
|---|---|---|
| V38 | An aggregate command emits an event declared somewhere in the model. | Every event in every outcome of an aggregate command is declared somewhere in the model. Message for a single event is unchanged: `Command 'X' emits 'Y', which is no declared event.` |
| V31 | An orchestration command emits only an event that the same orchestration declares. | Every event in every outcome of an orchestration command is one the orchestration declares. Message unchanged for a single event. |
| V44 (new) | | A command's events are events its **owner** declares. For an aggregate command, every event in every outcome is declared by the same aggregate. An aggregate event of another aggregate, or a process event, is refused. This is the palette's "one command → one aggregate": a multi-event command is never a cross-aggregate write. (Today V38 only checks that the event exists somewhere; for a single event this is a stricter reading, so V44 applies **only to commands with more than one distinct event**, and the single-event case keeps V38's behaviour; see Migration.) |
| V45 (new) | | An event is listed at most once inside one outcome. An event may appear in more than one outcome of the same command. |
| V46 (new) | | When a command has two or more outcomes: (a) a `when` state, if given, is a declared state of the owner; (b) two outcomes never carry the same state; (c) either every outcome carries a `when` state or none does (mixing says "some alternatives are chosen by state and the rest by something unsaid"). When none does, advisory: "the choice between the outcomes of `X` is not declared." Rules (a) to (c) are errors; the missing-guard advisory is a warning. |
| V47 (new) | | A flow placement of events that follow a multi-event command: events attributed to one placement of the command (the event nodes in the same moment after the command node, and its `when` branches, before any other command of the same lane's context) all come from **one** outcome. Placing events from two outcomes of one placement is refused, because alternatives are exclusive. Placing only part of an outcome is advisory: "outcome `A, B` of `X` records `B` together with `A`; the flow places `A` only." Advisory per file, error over a merged project, like V22 to V43 (the project loader's per-file filter now covers V44 to V48). |
| V48 (new) | | Merged project only, advisory: an outcome of a multi-outcome command that no flow places. A command is reachable only through its alternatives if the model can say each one happens. |

V47 attribution reuses the node order the walk already uses (`MomentDefinition.sequence`, ADR-040). A flow that places a single-event command is not checked by V47, so existing flows are unaffected.

### D5. What each derived artifact does with several events

The engine today does **not** read `emitsEvent` to produce events. `simulation-scenario-generator.ts` simulates the nodes a flow **places**: a placed command becomes `SimProcess.<Command>`, and the events the author places after it are the stream. The declared `emits` is documentation and a validation target, plus the reading used by impact analysis, the event catalog, the TypeScript emitter and the specification document. This ADR keeps that: the flow remains the authority on what a scenario shows, and `emits` is the authority on what the flow may show.

| Artifact | Change |
|---|---|
| **Scenarios (`simulation-scenario-generator`)** | No change to how nodes become events. The flow places the events, V47 keeps the placed events a legal set, and a multi-event placement derives them in order after the command step. A flow reaches an alternative of (b) by placing that outcome's events; flows with `[branch]` moments or `when` blocks place a different outcome per branch, so the existing branch machinery derives one scenario per alternative with no new enumeration. See Simulation semantics for causation. |
| **Negative scenarios** | Unchanged. A precondition failure rejects the command whatever its outcomes; the rejection asserts zero events across every outcome (the palette's "rejection with NO event"). `SimFailure.<Command>.PreconditionViolation` is unchanged. The derived `then` text for a rejection already names no event. |
| **Topology (`topology-emitter`)** | Reads node ownership, not `emits`. `ownerOf(event)` is unchanged. Co-emitted events of an aggregate are attributed to that aggregate. No change to `emits` handling is needed; a test pins that a multi-event command produces no new relationship. |
| **Event catalog (`event-catalog-generator`)** | `findProducerCommand` and `buildProcessCatalogEntry` find the producing command with `c.emitsEvent === event.name`. They use `emittedEvents(c).includes(event.name)`, so every event of a multi-event command has an entry whose producer is that command. The producer gains two optional fields so a consumer can tell the shapes apart: `recordedWith?: string[]` (the other events of every outcome that contains this event, for (a)) and `alternativeTo?: string[]` (events in sibling outcomes, for (b)). Both are absent for a single-event command. |
| **Impact analysis (`impact-analysis-generator`)** | `addCommandNodes` links the command to **every** event of every outcome (`triggers` and `dependsOn`, both directions). A change to either event reaches the command and, through it, the other event. The aggregate and orchestration loops both change. |
| **Saga state machines** | Read the orchestration's `states` / `on` mapping, not `emitsEvent`. Unchanged. (A transition keyed on one event of an outcome is reached by any run that records it.) |
| **emit-ts (`typescript-emitter`)** | The handler return type follows the shape: `emits A` returns `A` as today; `emits A, B` returns `readonly [A, B]`; `emits A \| B` returns `A \| B`; `emits A, B \| C` returns `readonly [A, B] \| C`. The JSDoc carries one `@emits` tag per event, and `@outcome <State>` when the outcome has a guard. A command with no events still returns `void` and has no `@emits`. |
| **Gherkin (`gherkin-generator`, `feature-renderer`)** | Renders placed nodes, so a placed event is still `Then <Context> emits <Event>`. Co-emitted events are consecutive `And <Context> emits <Event>` lines after the command's `When`. Nothing is rendered for an outcome the flow does not place. The renderer never emits a scenario whose first step is `And` (existing test), and this keeps that. |
| **Specification document (`specification-document-generator`)** | `renderCommandNarrative`: `→ produces **A**, **B**` for (a); `→ produces **A** or **B**` for (b); with a guard, `→ produces **A** when Open, or **A**, **B** when OneUseLeft`. The command table row lists all events. The sequence diagram line `Cmd → A, B` is joined the same way. |
| **viz (`@mmmnt/viz`)** | Reads connections and event ids from flows, not `emits`. Unchanged. A placed multi-event outcome is several event nodes in a moment, which viz already lays out. |
| **MCP and CLI** | No code reads `emits` (`simulate.ts` mentions the word in a comment about policies). A pin test asserts the MCP model and CLI `parse`/`test`/`simulate` outputs are unchanged for a model that uses the new forms: they route through the helpers or read nothing. |
| **Specification importer (`packages/core/src/import`) and event-stream reader (`packages/sync`)** | They map an external single `emitsEvent: string` field to `emits X`. Unchanged; they produce only the plain single form. |

### D6. Simulation semantics, and what Facet receives

Facet consumes the derived scenario stream. The contract is the stream, so the semantics are stated as properties of the stream.

**Shape (a), `emits A, B`.** A scenario whose flow places the command and then both events produces, in order: `SimProcess.<Command>`, then `A`, then `B`.

1. The events of one outcome are **contiguous** and in the order the clause declares them.
2. Each event of the outcome has `causationEventIds = [<the command step's eventId>]`. The second does not cite the first: they are siblings of one transaction, not a chain. (Today, an event placed after another event with no `triggered-by` takes the latest prior emission as its cause; that default is overridden for an event attributed to a multi-event command.)
3. All events of the outcome carry the same `occurredAt` as the command step's result; the command step is one transaction. (Open question 3 asks whether Facet needs an explicit transaction marker instead.)

**Shape (b), `emits A | B`.** A scenario shows **exactly one** outcome of the command, namely the one its flow places.

4. A scenario never contains events from two outcomes of one command step (V47 guarantees it for authored flows). Facet may treat the appearance of events from two outcomes of one step as a violation of the model, as it does for any unpredicted effect.
5. The scenarios for the alternatives are distinct scenarios, reached through the flow's branches (`[branch]`, `when`), with the existing `branchSelections` option choosing among them. No new enumeration option is introduced.
6. A `when <State>` guard is not evaluated by the simulator. It is the **declared reason** a scenario reaches an alternative. The scenario's `when` text, which today reads "`X` is invoked ...", names the state: "`RedeemAccessCode` is invoked while the code is `OneUseLeft`". The state is metadata on the scenario step, not a prediction Facet checks against aggregate state.

**Rejection.** Unchanged for both shapes: no event from any outcome appears; the failure event is the only effect.

**Facet impact (consequences, not designs).** Facet must (i) accept sibling events with a shared causation as valid ordering, where it may currently read consecutive events as a chain; (ii) accept that a step in the catalog may have several outcome events and an `alternativeTo` / `recordedWith` annotation; (iii) display the step's guard state if it chooses to. This ADR states the stream contract only; any Facet changes are Facet's.

### D7. Palette mapping and documentation

No new swatch. A command sticky (`#a6ccf5`) produces one or more event stickies (`#ff9d48`) in the same moment, and a command with alternative outcomes is drawn once with the events of each outcome grouped. `docs/palette-delta-041.md` records that Moment now matches the palette's "event(s)" and updates `packages/core/README.md` and the Moment site pages that say a command "emits an event" (grammar pointer: the construct table's Command row). The wording for the platform palette is not changed: the palette already says "event(s)".

## Consequences

- The language states the palette's command: one aggregate, one transaction, one or more events, or a rejection with none. Authors stop choosing among a lost-atomicity policy, a split command and a missing fact.
- The flow stays the authority on what a scenario shows. `emits` remains the authority on what a flow may show. No derivation gains a hidden injection of events, which would change every existing derived artifact.
- Five new rules (V44 to V48) and one grammar operator (`|`). `emitsEvent` stays in the IR, so unupdated consumers read a real event.
- Cost: every package that reads `emitsEvent` moves to the helpers: `@mmmnt/core`, `@mmmnt/derive`, `@mmmnt/emit-ts`, `@mmmnt/generate`. `@mmmnt/viz`, MCP, CLI, the importer and the event-stream reader need no change.
- Risk: `A, B` reads like a list of alternatives to a reader used to `A | B` in other languages. The syntax and the examples in the README state the reading; V46 refuses an unclear mix.
- Risk: `when <State>` pushes authors toward declaring aggregate states, which are optional today. Without a state declaration the alternatives are still legal (V46 advisory). The guard is not an expression, so it cannot drift into a rules engine.

## Migration

Backward compatible at model level and at IR level.

- Every model that parses today still does, and its IR is byte-identical, because the plain `emits A` form produces no new field. Hand-built IR that sets only `emitsEvent` is read as a single outcome.
- The grammar changes the AST shape of `emits` (string to a clause node); `ast-to-ir` is the only reader of the AST field and is updated with it. The generated `ast.ts` and `grammar.ts` change.
- No new keyword. `|` is a new token; `,` and `when` already exist. An event field named `when` does not parse today (`when` is not among the words a field may be named) and still does not; a test pins that it is refused, so the clause gives `when` no new place to be read as a field.
- V44 applies only to commands that carry more than one distinct event. A single-event command whose event belongs to another aggregate (declared somewhere in the model) stays accepted as today, so no existing model gains an error. A follow-up ADR could tighten V44 to single-event commands; this ADR does not, because it would break models that parse today and it is not what the founder ruled.
- V47 and V48 apply only to multi-event commands; V45 and V46 apply only to the new forms.
- Semver: a minor release for `@mmmnt/core` and the packages that read the IR (the repository's pre-1.0 convention for additive grammar).

### How backward compatibility will be proven

A golden comparison, run before and after on the same inputs, with a baseline recorded from `origin/main` at the commit this work branches from:

1. **Fixtures.** For every `.moment` under `fixtures/valid/**` (the existing sweep in `grammar-backward-compat.integration.spec.ts` already collects them), parse, serialize the IR to canonical JSON, and compare byte for byte with the baseline. For every `fixtures/invalid/**`, compare the set of rule ids reported per file.
2. **Ticketwave.** Ticketwave itself gains the multi-event cases (founder ruling), so its derived outputs change. The proof therefore runs on ticketwave **at the spec content of the commit this work branches from**: parse it, and regenerate every file in `examples/ticketwave/facet/` (scenarios, topology, event catalog, impact analysis, policy definitions, saga state machines, asyncapi, manifest) with the new build; the output must equal the baseline recorded from the old build, byte for byte. The committed `examples/ticketwave/facet/` is then regenerated from the new spec and committed, and Facet's checker is run over it (below).
3. **SAMMI.** SAMMI (`/Volumes/Storage/development/projects/sammi/firebase/model`) is not in the moment repository; the baseline records its IR and every derived artifact from the old build, and the same comparison runs after. It must be byte-equal, and its `test` run stays 64 of 64.
4. **Derived outputs for each fixture.** The comparison covers scenarios, negative scenarios, topology, event catalog, impact analysis, saga state machines, Gherkin, specification document and emit-ts output, not just the IR.
5. **Regression test verified by reintroducing the defect.** The compat test is run once against a branch that deliberately emits `outcomes: [{ events: ['A'] }]` for a plain `emits A`; it must fail on the IR diff. A compat test that cannot fail proves nothing.
6. **The new forms are additive.** The IR and derived artifacts of the new ticketwave cases are compared with equivalent single-event models in the unit specs, and the shared parts are asserted equal.

## Rejected alternatives

1. **Split the command into one-event commands** (`ConvertHoldToReservation` and `CloseHold` as two commands). Rejected: the palette defines a command as "one command → one aggregate → one transaction". Two commands are two transactions, so the atomicity of the facts is lost and a failure between them leaves a converted hold that is not closed. It also breaks the ubiquitous language (the business issues one intent, "convert the hold") and makes the second command an artefact of the language's limit, which must be invoked by someone, so it grows a caller (a policy or a saga) the domain never had. For alternatives (b) it is worse: the caller has to know the state to choose a command, which moves the aggregate's decision out of the aggregate.
2. **Model it as a saga** (an orchestration whose steps record the events). Rejected: the palette defines a saga as a "multi-step cross-aggregate/context workflow with state + compensation". A multi-event command is one step, inside one aggregate, with nothing to compensate because it is one transaction. Dressing it as a saga would add states, a timeout and a `compensation none` to say "atomic", and ADR-040 already settled that a process manager is not an aggregate's stand-in (its rejected alternative 6, in reverse). It would also make the aggregate's facts the saga's, which V31 forbids.
3. **Keep one `emits` and add a policy** (the status quo for ticketwave's `CloseHoldOnConversion`). Rejected as the only answer: a policy is the palette's reaction in a **later** transaction ("whenever X, then Y"). It cannot say the facts were recorded atomically, a failure between the event and the policy's command leaves the model inconsistent, and the aggregate no longer owns the invariant ("a converted hold is closed"). Policies remain right where the palette puts them: cross-aggregate reactions such as `ConvertHoldOnPayment` (Payment to SeatHold), and they stay unchanged by this ADR.
4. **One list for both shapes** (`emits A, B` meaning "these, or one of these, depending on context"). Rejected: the shapes are opposite promises (D2), and no consumer could tell them apart.
5. **A guard per event** (`emits A when S, B when T`). Rejected: the guard belongs to the transaction, not to one event (D2).
6. **Free-form guards or payload predicates.** Rejected, as ADR-040 rejected them: Moment has no expression language, and a guard here is the name of a declared state.
7. **Making the simulator inject a command's events.** Rejected: today a scenario's events come from the nodes a flow places. Injecting declared events would change every existing scenario, topology and catalog, break the compat proof, and take the flow's authority away. The validator (V47) is the right place for consistency between the flow and `emits`.
8. **Replacing `emitsEvent` with `emits: string[]` in the IR.** Rejected: it changes the IR of every existing model and breaks hand-built IR and any consumer that reads the scalar. The scalar stays, `outcomes` is additive, and the helpers make the migration one place per package.
9. **Cross-aggregate multi-event commands** (the payment confirmation that also releases a hold). Rejected by the palette: "targets exactly one aggregate root". V44 refuses it.

## Enforcement and tests (test-first, per package)

Specs live next to the code, in the `*-adr041` naming ADR-037/038/040 used. Ticketwave carries the worked examples; the fixtures under `fixtures/` carry the refusals and the forms ticketwave does not use.

Ticketwave itself carries the valid cases (`examples/ticketwave/spec/ticketwave.moment`): `SeatHold.ConvertHoldToReservation` with `emits HoldConvertedToReservation, HoldClosed`; `AccessCode` with states and `RedeemAccessCode` as in D1; a flow that places each outcome of `RedeemAccessCode` through `[branch]` moments; a flow that places the `ConvertHoldToReservation` outcome in full. A small self-contained valid fixture, `fixtures/valid/multi-event-commands/`, exercises what ticketwave does not: an orchestration command that records two process events, a state-guarded outcome inside an orchestration, and the unguarded `A | B` form. Invalid fixtures: `multi-event-v44` (an event of another aggregate in a multi-event list), `v45` (an event twice in one outcome), `v46` (a `when` naming an undeclared state; two outcomes with one state; one guard on only some outcomes), `v47` (events from two outcomes in one placement), `v38` and `v31` (an undeclared event in a later position).

### `@mmmnt/core`

Write first, each failing for the right reason:

| Spec | Proves |
|---|---|
| `__tests__/grammar/moment-grammar.spec.ts` (extended) | `emits A, B`, `emits A \| B`, `emits A, B when S \| C when T` parse for an aggregate command; an orchestration command takes the same clause and may omit it; `emits A` still parses to the plain form; an event field named `when` is refused, as before; `A \| B` without spaces parses (`ID` excludes `\|`). |
| `__tests__/parser/ast-to-ir-adr041.spec.ts` (new) | Plain `emits A` yields no `outcomes`. Other clauses yield `outcomes` in order with `whenState`, and `emitsEvent` is the first event of the first outcome. `emittedEvents` and `emitOutcomes` return the right lists for plain, multi, alternative and hand-built IR. |
| `__tests__/validation/palette-conformance.spec.ts` (extended) | V31 per event of every outcome, both ways. V44 refuses a foreign event in a multi-event list and stays quiet for a single-event command. V45 refuses a repeat inside one outcome and accepts one across outcomes. IR that predates the ADR stays quiet. |
| `__tests__/validation/model-completeness-ir.spec.ts` (extended) | V38 per event of every outcome; the single-event message is unchanged. |
| `__tests__/validation/moment-validator-adr041.spec.ts` (new) | V46 (a) to (c) as errors and the advisory for missing guards; V47 error for events from two outcomes in one placement and advisory for a partial outcome; V47 quiet for single-event commands; V48 only over a merged project. |
| `__tests__/project/project-loader-adr041.spec.ts` (new) | The valid fixture loads clean and reaches every construct; each invalid fixture reports exactly its rule id and no other. |
| `__tests__/integration/grammar-backward-compat.integration.spec.ts` (extended) | The golden comparison of "How backward compatibility will be proven", items 1, 2, 5 and 6. |

Then, in this order: grammar (`moment.langium`), regenerate `ast.ts` and `grammar.ts`; IR types and helpers; `ast-to-ir`; validators; the project loader's per-file filter for V44 to V48; the two syntax files (`packages/core/syntaxes/moment.tmLanguage.json` and `packages/vscode/syntaxes/moment.tmLanguage.json`: no keyword is added, so a check, not an edit, unless the highlighter needs the `|` scope); changeset.

### `@mmmnt/derive`

| Spec | Proves |
|---|---|
| `engine/__tests__/simulation-adr041.spec.ts` (new) | (a): command step then both events, contiguous, in declared order, each caused by the command step and neither by the other. (b): the branch flows derive one scenario per alternative, each with exactly one outcome; the scenario `when` text names the guard state. A rejection carries no event of any outcome. Negative scenarios are unchanged for a multi-event command. |
| `engine/__tests__/event-catalog-adr041.spec.ts` (new) | Every event of a multi-event command has an entry whose producer is the command; `recordedWith` and `alternativeTo` are set as D5 says and absent for single-event commands. |
| `engine/__tests__/impact-analysis-adr041.spec.ts` (new) | The command links to every event of every outcome in both directions, for aggregates and for orchestrations. |
| `engine/__tests__/topology-adr041.spec.ts` (new) | A multi-event command adds no relationship; owners are unchanged. |
| `engine/__tests__/multi-event-fixture-adr041.spec.ts` (new) | The valid fixture and ticketwave derive end to end. |
| `engine/__tests__/derivation-compat-adr041.spec.ts` (new) | Items 2 and 4 of the compat proof: ticketwave's facet files regenerate unchanged when the spec is the pre-ADR content, and the committed facet files equal the regeneration of the current spec. |

Then implement: the catalog and impact-analysis readers move to `emittedEvents`; the scenario generator changes only where an event placed after a multi-event command gets the command step as its causation; nothing else.

### `@mmmnt/emit-ts`

`services/typescript-emitter-adr041.spec.ts` (new): the return type and JSDoc for each of the four forms; a command with no events is still `void` with no `@emits`. Then the emitter.

### `@mmmnt/generate`

`services/generate-adr041.spec.ts` (new): the `And ... emits` lines after the command `When`, no first-step `And`; the narrative line, the table row and the sequence line for (a), (b) and the guarded form. Then the generators.

### `@mmmnt/viz`, MCP, CLI, importer, event-stream reader

Pin tests only (`flow-timeline-adr041.spec.ts` in viz; a status pin in MCP; a `parse`/`test`/`simulate` pin in the CLI; the importer and reader specs unchanged and green): their outputs for the new fixture equal their outputs for the equivalent plain-form model. No source change. If a pin fails, that package reads `emits` after all and is added to the plan.

### Documentation

`docs/palette-delta-041.md` (new, the D7 text); `packages/core/README.md` Command row and the `emits` description; the Moment site pages that describe a command's `emits`; a changeset naming the new rules and the one new operator, and stating the SAMMI scope per the compat proof, item 3.

### Reachability sweep before any "done" claim

For every new construct, name what invokes it: each outcome shape reaches a flow placement through the fixture; each of V44 to V48 is driven both ways; `outcomes` and the two helpers are read by the catalog, impact analysis, emit-ts and generate, and no consumer reads `emitsEvent` or `outcomes` directly (a grep gate in the package tests sweeps `packages/*/src` rather than listing the consumers by name). A construct no fixture reaches is an orphan.

### Schema contracts

This repository does not export JSON Schema contracts from its ADRs. The IR type changes in D3 and the event-catalog fields in D5 are the contract. No JSON Schema delta.

## Questions and rulings

1. **Guard form.** Ruled "Include it now": `when <State>` and V46 are part of this ADR.
2. **V44 on single-event commands.** Left as drafted: V44 applies to commands that carry more than one distinct event. A later ADR may tighten it.
3. **Transaction marker.** Left as drafted: contiguity, a shared cause and a shared timestamp; a marker is a Facet decision.
4. **Ticketwave example.** Ruled "In ticketwave itself": the multi-event cases are in `examples/ticketwave/spec/ticketwave.moment`, and `examples/ticketwave/facet/` is regenerated and committed. The payment-confirms-and-releases-a-hold case stays a policy.
5. **SAMMI.** The model at `/Volumes/Storage/development/projects/sammi/firebase/model` is the verification target.

## Implementation notes (2026-11-05)

What the build settled that the draft left open, or corrected.

1. **A field named `when`.** The draft said it parses today. It does not; the correction is in the Migration section and the grammar spec pins the refusal.
2. **Where the rules live.** V44 to V48 are IR rules in `packages/core/src/validation/multi-event.ts`, run from `validatePaletteConformance`, so they report per file as warnings and over a merged project as errors, like V29 to V43. A finding may carry its own severity: V46 (a) to (c) are errors in both, the V46 missing-guard advisory, the V47 partial-outcome advisory and V48 are warnings in both.
3. **V46 (a) applies to any `when`**, also on a command with one outcome: a guard that names no declared state is an error whatever else the command says. (b) and (c) need two or more outcomes. A state is declared by an aggregate's `state` lines (the initial state and both ends of a transition) or by an orchestration's `states`.
4. **V47 attribution.** The events attributed to one placement are the events of the command that follow it in its moment, along each path through the moment (the main entries; the entries before a `when` block plus that block's own), up to the next command of the same lane. The placed set matches an outcome exactly, or else the first outcome that holds all of it; no match is the refusal. An event the model does not declare is not counted missing (V31 and V38 report it).
5. **V48** is reported only by the project loader, for commands with two or more outcomes and more than one distinct event; a placement counts for the outcome it matches under V47.
6. **A project keeps the findings of a file it could not merge.** A file whose own findings include an error (V46) adds no IR, so the merged validation could not report it again and the per-file filter had dropped it; the project then looked clean. The loader now keeps the findings of a file that failed.
7. **Simulation.** The events attributed to a multi-event command (the same attribution as V47, along the walked path) take the command step as their cause when they declare no `triggered-by`, and the command step's timestamp. The command step's payload carries `whenState` when the outcome the path shows has a guard, and the scenario `when` reads `The flow progresses through <moments>; <Command> is invoked while <Owner> is <State>`; scenarios that reach no guarded outcome keep their text.
8. **Event catalog.** `recordedWith` lists the other events of every outcome that contains the event; `alternativeTo` lists the events of the outcomes that do not contain it. An event that belongs to two outcomes can carry both.
9. **emit-ts.** A repeated union member is written once. The JSDoc carries one `@emits` per distinct event, then `@outcome <State>: <events>` per guarded outcome.
10. **Gherkin and the specification document.** The first event of an outcome stays `Then`; the later ones are `And`. The document writes `A, B`, `A or B`, and `A when S, or A, B when T`, in the narrative (events in bold), the command table and the sequence diagram.
11. **Examples.** Ticketwave carries the cases: `SeatHold.ConvertHoldToReservation` emits `HoldConvertedToReservation, HoldClosed`; `AccessCode` declares `Open -> OneUseLeft on RedeemAccessCode` and `RedeemAccessCode` emits `AccessCodeRedeemed when Open | AccessCodeRedeemed, AccessCodeExhausted when OneUseLeft`; the presale flow places the two outcomes in a `[branch]` moment. `fixtures/valid/multi-event-commands` holds the forms ticketwave does not use.
12. **The compat proof** ran outside the repository on the build of `origin/main` against this build, over every valid fixture, every invalid fixture's rule ids, ticketwave at its pre-ADR spec and the SAMMI model, and failed on a deliberately wrong build (see the release notes of the work). In the repository, the backward-compat sweep asserts that a plain `emits A` writes no `outcomes`, and the derivation-compat spec asserts that the committed ticketwave facet files are the derivation of its spec.

# ADR-040: Process events, cause-scoped preconditions, note-only moments and intra-moment policy hops

- **Status:** Accepted (founder, 2026-11-04). Ruling, verbatim: "Accept, build it (Recommended)".
- **Date:** 2026-11-04
- **Supersedes:** nothing. Amends ADR-038 section 2 (orchestration) and the validation rules V5, V10, V31.
- **Founder ruling (2026-11-04, verbatim):** "1, but generalize what's being added. do not extend Moment with specificity to [a single consumer]'s use case. update the palette and documentation"
- **Where ADRs live:** this repository had no ADR directory. ADR-037, ADR-038 and ADR-039 landed in e5b7fc1 (#181) and survive only as the changeset text in `packages/core/CHANGELOG.md`, in code comments that cite them, and in the fixtures and specs named `*-adr037` / `*-adr038`. This file creates `docs/adr/` and takes the next number, 040. The text of ADR-038 was not available in the repository; its rules are read here from the changelog, `moment.langium`, `palette-conformance.ts` and `README.md`. The author of the ratified version should check section references to ADR-038 against the original.

## Context

Moment models a domain as contexts (aggregates, commands, events, policies, orchestrations) and as flows (lanes, moments, nodes, connections). ADR-038 held the grammar to the Event Storming palette: a policy is one event and one command, and an orchestration is the palette's process manager. Four modelling needs recur in ordinary DDD and Event Storming work and are not expressible today. Each one is stated here in domain terms, with neutral examples. None depends on a particular product.

### 1. A process has outcomes, and a process outcome is a fact

A process manager (the palette's Saga, written `orchestration`) coordinates a long-running sequence. When it ends, the business wants a fact that others can react to. Example, vet-clinic: an `AdmissionProcess` admits a pet, requests a lab panel from an external laboratory, and books a ward bed. When it ends, "AdmissionCompleted" or "AdmissionAbandoned" is a fact. A billing policy reacts to `AdmissionCompleted`. A dashboard projection counts `AdmissionAbandoned`.

Today that fact cannot be declared. An event must sit in an aggregate (grammar: `AggregateMember`), and an orchestration's commands emit nothing (V31). Authors have three bad options: invent an aggregate whose only job is to own the process's outcome events, write the outcome as a comment, or leave consumers with nothing to subscribe to. The first one is a modelling lie (an aggregate is a consistency boundary, and this one guards nothing). The second one makes the model silent about a real contract.

ADR-038 already gave a process its own commands, so "a command outside an aggregate" is not a gap. The gap is that those commands have no observable effect in the model.

### 2. One command, several causes, and a refusal that belongs to one of them

A command is sometimes issued for different causes: by a person asking, by the system acting on a rule, by a correction. Some refusals apply only to one cause. Example, vet-clinic: `CancelAppointment` is issued when an owner asks to cancel (cause `OwnerRequest`) and when the clinic cancels because a vet is unavailable (cause `ClinicClosure`). The refusal `WithinCancellationWindow` ("cancelling less than 24 hours ahead is refused") is a rule of the owner's request. The clinic's own cancellation is never refused for that reason.

Today a precondition belongs to the command and applies to every use of it. `deriveNegativeScenarios` therefore derives `neg-CancelAppointment-WithinCancellationWindow` for every flow that places `CancelAppointment`, including the clinic-closure flow, where the scenario is false: the derived failure cannot happen. An author must either split the command (two commands for one intent, breaking the ubiquitous language and the one-command-one-event symmetry), drop the precondition (losing a real rule and its test), or accept false negative scenarios.

### 3. A step of a flow that is not a declarable thing

A flow narrates a business story. Some steps in it are not in the model: the step happens in a system the model does not describe, or it is a transformation too fine to be a command (the laboratory processes the sample). Example, ticketwave: in the checkout flow, the card network authorises the card; the model begins again when `PaymentReceived` arrives. V10 says a moment must contain at least one node or a `when` block. The author must put a stand-in node in the moment (a value object or an unrelated event "to hold the place") or delete the moment, so the flow no longer reads as the story. Comments do not help: `//` comments are hidden terminals and are not in the AST, so the moment is empty to the validator, and the narration is invisible to every consumer (Facet, the specification document, Gherkin).

A stand-in node is worse than a gap. It is derived as if it were behaviour: it appears in simulated event streams, in topology and in impact analysis.

### 4. A reaction inside one moment

In Event Storming one pivotal moment often shows the whole reactive column: an event, the policy that reacts to it, and the command the policy issues. Example, ticketwave: `OrderPlaced`, the policy `ReserveSeatsOnOrderPlaced`, and the command `ReserveSeats` are one beat of the story. V5 requires `triggered-by` to name a node from a prior moment. The author must split one beat into two moments, which falsifies the narrative granularity and adds a moment label that nobody said, or omit the edge and lose the causation that Facet animates and checks for ordering.

## Decision

Moment gains four additions. All are general DDD and Event Storming constructs. None names a product, a spec or a domain.

### D1. Process events

An orchestration may declare events. Its commands may emit them.

```
orchestration AdmissionProcess
  command StartAdmission
    input petId: UUID
    precondition PetIsRegistered: "The pet has a clinic record"
    emits AdmissionStarted
  command AbandonAdmission
    emits AdmissionAbandoned
  event AdmissionStarted
    petId: UUID
  event AdmissionCompleted
    petId: UUID
    bedId: UUID
  event AdmissionAbandoned
    petId: UUID
  invoked-by StartAdmission
  issues RequestLabPanel, BookBed
  states Started
  compensation on AbandonAdmission issues ReleaseBed
  timeout "48h"
```

Grammar (`moment.langium`):

```
SagaDeclaration:
    keyword=('orchestration' | 'saga') name=ID
        commands+=OrchestrationCommand*
        events+=DomainEventDeclaration*          // new
        'invoked-by' invokedBy=ID
        ...
```

`OrchestrationCommand` already allows `('emits' emits=ID)?`; it needs no change. A process event is the existing `DomainEventDeclaration`: same fields, same field lifecycle, same annotations.

Semantics:

- A process event is a domain event. It is owned by the orchestration that declares it rather than by an aggregate.
- An orchestration command that carries `emits` emits one event, and the event is one the orchestration itself declares.
- Policies can trigger on process events (V30), projections can source from them (V22), services can consume them (V28), and flows can place them as nodes, exactly like aggregate events.
- A process event is not emitted by "the saga as an actor"; it is the recorded outcome of one of its commands. The orchestration's other duties (issue, advance, compensate) are unchanged.

IR:

- `SagaDefinition.events?: EventDefinition[]`.
- `EventDefinition.owner?: { kind: 'aggregate' | 'orchestration'; name: string }`. Set by the parser for every event. Absent in hand-built IR, which is read as `aggregate`.
- `ContextDefinition.events` (the flat list that V22, V30, node resolution, `findEvent` and `emit-ts` already read) also contains the process events. Consumers that read only the flat list keep working. Consumers that care who owns an event read `owner`.
- `OrchestrationCommandDefinition.emitsEvent` is unchanged. It is now permitted.

### D2. Cause-scoped preconditions

A command may declare the causes it can be issued for. A precondition may name the causes it applies to. A flow placement may name the cause the command is issued for.

```
aggregate "Appointment"
  identity appointmentId: UUID
  command CancelAppointment
    input appointmentId: UUID
    causes OwnerRequest, ClinicClosure
    precondition AppointmentIsOpen: "The appointment has not been completed"
    precondition WithinCancellationWindow cause OwnerRequest: "The owner cancels at least 24 hours ahead"
    emits AppointmentCancelled
```

```
flow "Owner cancels"
  lane desk "FrontDesk" [Core]
  moment "Owner asks to cancel"
    desk: CancelAppointment cause OwnerRequest
    desk: AppointmentCancelled
```

Grammar:

```
CommandDeclaration:
    'command' name=ID
        ('input' inputs+=InputField (',' inputs+=InputField)*)?
        ('causes' causes+=ID (',' causes+=ID)*)?             // new
        preconditions+=Precondition*
        'emits' emits=ID;

Precondition:
    'precondition' name=ID ('cause' causes+=ID (',' causes+=ID)*)? ':' description=STRING;   // cause clause new

NodePlacement:
    laneId=ID ':' nodeName=ID
        multiplicity=Multiplicity?
        modifier=NodeModifier?
        ('cause' cause=ID)?                                    // new
        crossing=ContextCrossing?
        connections+=Connection*;
```

`OrchestrationCommand` receives the same `causes` clause (its `Precondition` is the shared rule).

Semantics:

- A precondition with no `cause` clause applies to every cause. This is today's behaviour.
- A precondition with a `cause` clause applies only when the command is placed, or issued, for one of those causes.
- A cause is a name. It is not an expression, a guard or a predicate over the payload (see Rejected alternatives).
- A command that declares no causes behaves exactly as today. A placement may not carry a `cause` for such a command (V41).

IR:

- `CommandDefinition.causes?: string[]`, `OrchestrationCommandDefinition.causes?: string[]`.
- `PreconditionDefinition.causes?: string[]` (absent or empty means every cause).
- `MomentEntry.cause?: string`.

`causes`, `cause` become keywords. They are added to `FieldName` and `InputName` so a field named `cause` still parses (the same migration device ADR-037 used for `projection` and `rule`).

### D3. Note-only moments (V10 relief)

A moment may carry notes. A note is narration that is not a node: it names a step that happens outside the model or below its grain.

```
flow "Checkout"
  lane shop "Ordering" [Core]
  lane psp "CardNetwork" [External]
  moment "Order placed"
    shop: PlaceOrder
    shop: OrderPlaced
  moment "Card is authorised"
    note psp: "The card network authorises the card and answers within seconds"
  moment "Payment recorded"
    shop: RecordPayment
      triggered-by OrderPlaced
    shop: PaymentRecorded
```

Grammar:

```
MomentDeclaration:
    'moment' label=STRING isBranch?='[branch]'?
        (nodes+=NodePlacement | whenBlocks+=WhenBlock | notes+=NoteStatement)*;

NoteStatement:
    'note' (laneId=ID ':')? text=STRING;
```

`laneId` is optional. When it is given it must be a declared lane (V13), and it makes the note speak for that lane: an `[External]` lane is the usual one.

IR: `MomentDefinition.notes?: { text: string; laneId?: string }[]`. Notes take part in `sequence` (new item kind `'note'`) so that source order is kept.

`note` becomes a keyword. A lane or node named `note` stays legal in a placement (`note: Something`) because a `note` followed by `:` is a placement and a `note` followed by a string, or by an ID and `:`, is a note statement. If Langium's lookahead cannot decide this cleanly, `note` is added to `FieldName` and a lane named `note` is documented as the one source break (see Migration).

A note asserts nothing. It is never a node, never a prediction, never a simulated event.

### D4. Intra-moment policy hops (V5 relief)

`triggered-by` may name a node placed earlier in the same moment, when the model declares the hop.

```
moment "Order placed"
  shop: OrderPlaced
  shop: ReserveSeatsOnOrderPlaced
    triggered-by OrderPlaced
  shop: ReserveSeats
    triggered-by ReserveSeatsOnOrderPlaced
```

No grammar change. The change is in validation, derivation and rendering.

### Validation changes

| Rule | Before | After |
|---|---|---|
| V5 | `triggered-by` must name a node from a prior moment. | `triggered-by` must name a node that appears earlier in the flow in source order: in a prior moment, or earlier in the same moment (including its `when` blocks, in source order). A target in the same moment must be a declared causal hop, checked by V43. A node never names itself or a later node. |
| V10 | A moment must contain at least one node or `when` block. | A moment must contain at least one node, `when` block or note. |
| V31 | An orchestration's commands emit no domain event. | An orchestration command emits only an event that the same orchestration declares. It never emits an aggregate's event. |
| V40 (new) | | An event name is declared by one owner in the model: one aggregate or one orchestration. A process event cannot repeat the name of an aggregate event or of another orchestration's event. |
| V41 (new) | | A `cause` named on a precondition or on a placement is one of the command's declared `causes`. A command that declares no causes accepts neither. |
| V42 (new) | | A placement of a command that declares causes and has any cause-scoped precondition names its `cause`. Warning in a single file, error over a merged project. |
| V43 (new) | | A same-moment `triggered-by` is a declared hop: (a) the target is an event and the node is a policy whose `trigger` is that event; or (b) the target is a policy and the node is the command the policy `chains-to`; or (c) the target is an event and the node is a command that some policy with that `trigger` chains to. It needs the project model; in a single file without one, only the source-order part of V5 is checked. |

V5 and V43 together close the original reason for V5 (a cause must precede its effect): source order is total, so no cycle is possible within a moment, and the hop must be one the model declares, so `triggered-by` cannot be used to draw an edge the policies do not support.

### Derive changes (`@mmmnt/derive`)

1. **Negative scenarios for process commands.** `findCommand` in `simulation-scenario-generator.ts` searches `ctx.commands` and the commands of aggregates only. It also searches `ctx.sagas[*].commands`. A placed orchestration command with preconditions now derives `neg-<Command>-<Precondition>` like an aggregate command. The failure event keeps its form, `SimFailure.<Command>.PreconditionViolation`.
2. **Cause-scoped derivation.** `findPreconditions(node, contextMap)` filters the command's preconditions by the node's cause: a precondition with no `causes` always applies; one with `causes` applies when `node.cause` is in the list. `NodeInfo` carries the `cause` from `MomentEntry.cause`. The failure event payload adds `cause` when the node has one, and the `when` text reads "... is invoked for <cause> without satisfying <precondition>". Scenario ids need no new part, because the flow that places the command already names the cause, and the existing path-index suffix keeps repeated command/precondition pairs apart.
3. **Process events in simulation.** `findEvent` also searches the events of orchestrations (they are in the flat `ctx.events`, so no change is needed if D1's IR rule holds). `injectSagaTransitions` is unchanged. A process command that emits an event produces that event in the simulated stream after the command and before any saga transition marker, so a policy that triggers on it is reachable.
4. **Notes.** `walkPlainMoment` and `walkBranchedMoment` read only `contextEntries` and `branches`, so a note-only moment adds no entries and no events. The moment is kept in the walk (its label is a `returns-to` target, V6). `buildWhenClause` and `buildThenClause` skip notes; the Gherkin generator renders each note as a comment line (`# note (CardNetwork): ...`) and the specification document renders it as a narrated step. `enumerateBranchCombinations` is unaffected, since a note-only moment has no branches.
5. **Same-moment causation.** `findCausationEvents` and `findLatestPriorEmission` already search earlier nodes of the walk. The walk must order nodes by `MomentDefinition.sequence` so a same-moment `triggered-by` resolves to the earlier node. A test pins this (see Enforcement).
6. **Impact analysis and topology** read `owner`, so a process event is attributed to its orchestration rather than to a nonexistent aggregate.

### Facet and viz rendering

- A process event renders as any event, with the owner shown as the orchestration.
- A note-only moment renders as a moment column with its label and the note text, with no stickies under it. A note with a lane renders in that lane's cell.
- A same-moment `triggered-by` renders as a short vertical causal arrow inside the column, from the earlier sticky to the later.
- A cause renders as a chip on the command sticky, and a cause-scoped precondition renders with the same chip on its refusal line.

### Palette mapping

No new swatch is introduced. Every addition reuses an existing NDD swatch.

| Construct | Swatch | Rule |
|---|---|---|
| Process event | Event `#ff9d48` | An event is an event. The owner is shown by a Process `#c6a2d2` edge on the sticky, in place of the aggregate marker. |
| Orchestration (unchanged) | Process/policy `#c6a2d2` | |
| Process command (unchanged) | Command `#a6ccf5` | |
| Cause-scoped precondition | Business rule/refusal `#fff9b1` | The refusal sticky carries a cause chip: `WithinCancellationWindow [OwnerRequest]`. An unscoped precondition has no chip. |
| Cause on a placement | Command `#a6ccf5` | A chip on the command sticky: `CancelAppointment [OwnerRequest]`. |
| Note-only moment | Moment `#9ea9ff` | The moment sticky carries the note text in its body. A lane-attributed note on an `[External]` lane colours the lane label External system `#ffcee0`. |
| Same-moment hop | Event `#ff9d48`, Process/policy `#c6a2d2`, Command `#a6ccf5` | The canonical Event Storming column. |

The change to the platform palette and to Moment's own pages is in `docs/palette-delta-040.md`.

## Consequences

- A process can announce its outcome in the model, and consumers can be written against it. Policies, projections and services stop depending on comments.
- The ubiquitous language keeps one command per intent. Refusals that belong to one cause are testable without false negatives.
- A flow can narrate steps outside the model without stand-in nodes. The model becomes more honest: a step the model does not describe is declared as a note, and the validator can tell a note from a node.
- V5 becomes a rule about order plus a declared hop, not about moments. The reactive column in one moment is expressible.
- `@mmmnt/derive`, `@mmmnt/generate`, `@mmmnt/viz`, `@mmmnt/emit-ts` and `@mmmnt/harness` each need a change (listed in Enforcement). The IR gains optional fields only.
- Cost: four new keywords (`causes`, `cause`, `note`) and three or four new rules (V40 to V43). The grammar's FieldName list grows, which is the maintenance cost ADR-037 already accepted.
- Risk: allowing `event` declarations between an orchestration's commands and `invoked-by` makes the field list of the last event ambiguous with `invoked-by`, which is a `FieldName` keyword. The implementation must either move `invoked-by` out of `FieldName` for this position or require events after the `timeout` line. The tests in Enforcement decide it. It does not change the decision.

## Migration

Backward compatible at the model level, with two edge cases at the grammar level.

- Every model that parses and validates today still does. Process events, causes, notes and same-moment hops are all additions. V10 and V5 only accept more. V31 accepts more.
- IR: all new fields are optional. Hand-built IR is unaffected. `owner` absent reads as `aggregate`.
- New keywords. A field, input or lane named `cause`, `causes` or `note` must keep parsing. `cause` and `causes` are added to `FieldName` and `InputName`. A lane or node id named exactly `note` is the one source break; a lookahead rule (`note` followed by a string, or by an ID and `:`) removes it if Langium can decide it. Otherwise the break is documented and the changeset names it.
- Semver: a minor release for `@mmmnt/core` and the packages that read the IR (the pre-1.0 convention in this repository already uses minor releases for additive grammar, as in 0.6.0).
- Existing flows that used a stand-in node for a note, or two moments for one beat, are not rewritten automatically. A migration note in the docs shows how to turn them into notes and hops.

## Rejected alternatives

1. **Constructs shaped for one product's vocabulary.** A "response" node kind, a "refusal" kind, or an "outcome" event type tied to one spec. Rejected: the founder's ruling is that Moment is not extended to fit one user. The four needs above are common to any process-manager or Event Storming model, and the additions are stated in the vocabulary of the DDD and Event Storming literature.
2. **Stand-in value-object or event nodes in empty moments.** Rejected: they are derived as behaviour (they appear in simulated streams, topology and impact analysis), and they falsify the model to satisfy the validator. A note is the declared form of "this is not behaviour".
3. **Relaxing V5 and V10 wholesale.** Rejected for V10: allowing an empty moment would let a typo pass as a step, and an empty moment says nothing. A note-only moment carries a statement. Rejected for V5: dropping the "prior" rule entirely would allow `triggered-by` against later nodes and cycles, and would let an edge be drawn that no policy supports. The new rule keeps order and adds a grounded hop.
4. **Payload-condition branches.** Expressing the cause as a predicate over the command's payload (`precondition P when reason == "OwnerRequest"`). Rejected: Moment has no expression language, and adding one means a parser, a type checker and an evaluator for what is a naming problem. A cause is a name that a person chooses in the flow, which is what Event Storming does. Predicates also make derived scenarios depend on payload generation.
5. **Splitting the command per cause.** `CancelAppointmentByOwner` and `CancelAppointmentByClinic`. Rejected: two commands for one intent break the ubiquitous language and duplicate every shared precondition and input. They also emit one event each, so subscribers see two events for one fact.
6. **Process events as events of a synthetic aggregate.** Rejected: an aggregate is a consistency boundary. A synthetic one with no state and no invariants is a lie in the model, and ADR-038 already made an orchestration a first-class construct so it need not pose as one.
7. **Letting an orchestration emit aggregate events.** Rejected: only the aggregate that owns an event may emit it. The orchestration issues the aggregate's command and reacts to its event. V31's remaining half keeps this.
8. **Cause as a field of the command input.** Rejected: the input is payload. The cause is how the command is reached in the story, and the model then could not tell, at the flow, which preconditions apply without reading values.
9. **Recording notes as `//` comments and teaching the validator to count them.** Rejected: comments are hidden terminals by design and are not in the AST or the IR. Facet, the specification document and Gherkin could not show them.

## Enforcement and tests

Specs live next to the code, as the existing `*-adr037` / `*-adr038` specs do. Fixtures live under `fixtures/`, in the existing valid/invalid layout.

New fixtures (neutral domains: vet-clinic and the ticketwave example):

- `fixtures/valid/process-constructs/` : the `AdmissionProcess` orchestration with process events, a billing policy triggered by `AdmissionCompleted`, a projection sourced from `AdmissionAbandoned`; the `CancelAppointment` aggregate with causes and a scoped precondition; a flow with a note-only moment; a flow with a same-moment hop.
- `fixtures/invalid/process-v31/` (an orchestration command emitting an aggregate's event), `process-v40/` (an event declared by two owners), `process-v41/` (a placement cause the command does not declare), `process-v42/` (a scoped command placed with no cause), `process-v43/` (a same-moment `triggered-by` with no declaring policy), `process-v5/` (a `triggered-by` to a later node), `process-v10/` (a moment with no node, when block or note).

Specs and what they assert:

| Spec | Proves |
|---|---|
| `packages/core/__tests__/grammar/moment-grammar.spec.ts` (extended) | Syntax of `event` in an orchestration, `causes`, `cause`, `note`; a field named `cause`, `causes`, `note` still parses; the `invoked-by` ambiguity (see Consequences) is resolved. |
| `packages/core/__tests__/parser/ast-to-ir-adr040.spec.ts` (new) | IR: `owner`, `SagaDefinition.events`, `causes`, `MomentEntry.cause`, `notes`, `sequence` with notes; process events are in the flat `ctx.events`. |
| `packages/core/__tests__/validation/moment-validator.spec.ts` (extended) | V5 (order and same-moment target), V10 (note counts), each invalid fixture produces exactly its rule id and no other. |
| `packages/core/__tests__/validation/palette-conformance.spec.ts` (extended) | V31 reworded; V40, V41, V42, V43 driven both ways over hand-built IR; IR that predates ADR-040 stays quiet. |
| `packages/derive/src/engine/__tests__/simulation-scenario-generator.spec.ts` (extended) | A placed process command derives its negatives. A cause-scoped precondition derives a negative in the flow that places the matching cause and none in the flow that places the other cause. An unscoped precondition derives in both. Re-introducing the defect (ignoring `cause` in `findPreconditions`) fails the "none in the other flow" case. |
| `packages/derive/src/engine/__tests__/` (new `simulation-adr040.spec.ts`) | A process command's emitted event appears in the stream and a policy triggered by it is reachable; a note-only moment adds no events; a same-moment hop resolves its causation event to the earlier node. |
| `packages/generate/src/gherkin/__tests__/gherkin-generator.spec.ts` (extended) | A note renders as a comment line and no step; the specification document narrates it. |
| `packages/viz/src/__tests__/` (extended) | A note-only moment, a same-moment arrow and a cause chip render. |
| `packages/emit-ts/src/__tests__/services/typescript-emitter-adr040.spec.ts` (new) | Process events are emitted as types. |
| `packages/core/__tests__/integration/grammar-backward-compat.integration.spec.ts` (extended) | Every fixture that parsed before ADR-040 still parses with the same IR except the new optional fields. |

Reachability sweep before any "done" claim: for every new construct, name what invokes it. Process events must be reachable from a placed command and a trigger; causes from a placement; notes from a moment. A construct that no fixture reaches is an orphan.

Schema contracts. This repository does not export JSON Schema contracts from its ADRs (`packages/schema` is the schema registry for consumers' events, not Moment's IR). The IR type changes above are the contract. No JSON Schema delta.

## Implementation notes (2026-11-04)

Built as written. What the build found:

- **`invoked-by` ambiguity: none.** Langium's lookahead tells a process event's last field from `invoked-by`, so the stated fallback (event placement after `timeout`) was not needed. A process event may still have a field named `invoked-by`; a test pins it.
- **`note` ambiguity: resolved by lookahead for lanes.** A `LaneName` rule (`ID | 'cause' | 'causes' | 'note'`) names lanes in declarations, placements, `when [lane]` and `crosses-to`, so a lane named `note`, `cause` or `causes` parses. `note`, `cause` and `causes` are added to `FieldName` and `InputName`. The one source break is a **node** (command, event, policy and so on) named `note`, `cause` or `causes`.
- **Example correction.** The D1 example wrote `timeout "48h"`. The grammar's `timeout` takes an identifier or `"none"`, so the fixtures write `timeout admissionWindow`.
- **V43 is literal.** Only the three hops (a), (b), (c) are declared. A same-moment `triggered-by` of an event on its own command is not a hop and is reported; V43 skips a target the model does not declare, so a single file without the project only has V5's source-order check.
- **V40 scope.** It checks only names that a process event declares, so IR that predates ADR-040 and repeats an aggregate event name stays quiet.
- **Merged projects.** V40 to V43 are advisories per file and errors over a merged project, like V22 to V39. The project loader's per-file filter now covers them.
- **Consumers.** A flow in a single file can now place an orchestration command and a process event (V1). Derived negative scenarios now include the preconditions of placed orchestration commands, so a model that placed one gets more scenarios; `parse` and `test` results are unchanged.
- **Viz.** This repository's viz renders layout data (no stickies, no swatches). The timeline entry carries `notes`, `hops` and `causes`; the sticky and chip drawing, and the palette mapping, belong to Facet and the platform palette.

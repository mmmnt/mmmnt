# @mmmnt/core

Parser and intermediate representation for the Moment domain specification language.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/core.svg)](https://www.npmjs.com/package/@mmmnt/core)

## Overview

`@mmmnt/core` is the foundation of the Moment toolchain. It parses `.moment` files with a Langium grammar, checks them against the model rules, and turns them into a typed Intermediate Representation (IR). Every other Moment package reads that IR.

A `.moment` model describes bounded contexts, aggregates, commands, events, value objects, services, policies, orchestrations, projections, queries, rules, glossary terms, external systems, and the flows that connect them over time. A model can be one file or a directory of files loaded as one project.

The package also holds the Sift specification importer, the manifest scaffolder and updater, a file watcher, and the generator registry that generator packages plug into.

## Installation

Requires Node.js 22 or later.

```bash
npm install @mmmnt/core
```

Or with other package managers:

```bash
pnpm add @mmmnt/core
yarn add @mmmnt/core
```

## Quick start

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';

const path = 'examples/ticketwave/spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);

if (result.success && result.ir) {
  console.log(`Contexts: ${result.ir.contexts.length}`);
  console.log(`Flows: ${result.ir.flows.length}`);
}

// Errors make success false. Warnings leave it true.
for (const d of result.diagnostics) {
  console.log(`[${d.severity}] ${d.ruleId ?? ''} ${d.message}`);
}
```

To load a file or a whole model directory the way the `moment` CLI does, use `loadSpecification` (see [Loading a model directory](#loading-a-model-directory)).

## What the package provides

- **Parser.** A Langium grammar with error recovery. Each diagnostic carries a 1-based line and column.
- **Typed IR.** A normalized, typed model that downstream packages read without touching the syntax tree.
- **Model rules.** V1 to V57 check placements, references, orchestrations, aggregate states, multi-event commands, policy conditions and field types (see [Validation rules](#validation-rules)).
- **Project mode.** `ProjectLoader` parses many `.moment` files, merges them into one IR, and checks names across files.
- **Sift import.** `SiftSpecificationImporter` turns Sift building blocks and timeline events into `.moment` source, with an upstream fingerprint for drift tracking.
- **Manifest tools.** `ManifestScaffolder` writes a `.manifest.yaml` and the `.moment/contexts/` and `.moment/flows/` directories. `ManifestUpdater` keeps the manifest's file lists current.
- **File watching.** `FileWatcher` reports changes to `.moment` and YAML files after a debounce.
- **Deterministic output.** The same input always gives the same IR. Project files are merged in sorted path order.

## Language

A `.moment` file holds contexts, flows and external systems, in any mix. The grammar source is [`src/grammar/moment.langium`](src/grammar/moment.langium).

### Constructs

| Construct        | Where                                       | Syntax                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context          | top level                                   | `context "<Name>" [Core \| Supporting \| Generic \| Terminal \| External]`, optional `description "<text>"`, then its members.                                                                            |
| External system  | top level                                   | `external <Name> "<description>"`, then optional gateways. Usable as a relationship end and as an `[External]` lane.                                                                                      |
| Flow             | top level                                   | `flow "<Name>"`, optional `description`, then lanes and moments.                                                                                                                                          |
| Aggregate        | context                                     | `aggregate "<Name>"`, `identity <field>`, optional states, then commands, events, value objects, invariants and annotations.                                                                              |
| Aggregate states | aggregate                                   | `state initial <Name>` and `state <From> -> <To> on <Command>`, written right after the identity.                                                                                                         |
| Command          | aggregate, orchestration                    | `command <Name>`, optional `input <field>, ...`, optional `causes <Cause>, ...`, preconditions, then an `emits` clause (optional in an orchestration).                                                    |
| Precondition     | command                                     | `precondition <name>: "<text>"`, or `precondition <name> cause <Cause>: "<text>"` to limit it to some causes.                                                                                             |
| Emits clause     | command                                     | `emits A`, `emits A, B` (both, in one transaction), `emits A \| B` (one of them), `emits A when Open \| A, B when OneUseLeft` (the state that chooses each outcome).                                      |
| Event            | aggregate, orchestration                    | `event <Name>` followed by fields. An event declared in an orchestration is a process event.                                                                                                              |
| Value object     | context, aggregate                          | `value-object <Name>` followed by fields, `value-object <Name>: <Type>` for a scalar, or fields then `\| <Variant>` lines for a tagged union.                                                             |
| Invariant        | aggregate                                   | `invariant <Id> "<description>" scope <Name>`                                                                                                                                                             |
| Domain service   | context                                     | `service <Name> consumes <Name> produces <Name> description "<text>"`                                                                                                                                     |
| Policy           | context                                     | `policy <Name> trigger <Event> [when <field> = <value>] [after <Event>] action "<text>" chains-to <Command>`, then optional gateways. One event in, one command out.                                      |
| Orchestration    | context                                     | `orchestration <Name>` (`saga` is an alias): its own commands and events, `invoked-by`, `issues`, `states`, `compensation` and `timeout`, then optional gateways.                                         |
| Projection       | context                                     | `projection <Name> sources <Event>, ...`, optional `description`, `field <name>: <Type>` lines, and gateways.                                                                                             |
| Query            | context                                     | `query <Name> reads <Projection or ValueObject>, ...`, optional `input <name>: <Type>, ...` and `description`.                                                                                            |
| Rule             | context                                     | `rule <Id> "<description>" enforced-by <ServiceOrQuery>`, or `enforced-by "<external enforcer>"`.                                                                                                         |
| Glossary term    | context                                     | `term "<term>" "<definition>"`                                                                                                                                                                            |
| Relationship     | context                                     | `relationship <Source> -> <Target> type <Type> contract "<text>"`. Types: `CustomerSupplier`, `Partnership`, `Conformist`, `AnticorruptionLayer`, `OpenHostService`, `PublishedLanguage`, `SeparateWays`. |
| Annotation       | context, aggregate                          | `@classification(<value>)`, `@retention(<value>)` or `@encryption(<value>)`. It applies to the next declaration.                                                                                          |
| Gateway          | projection, policy, orchestration, external | `gateway <Name> consumes <Event or ValueObject> produces <Event or ValueObject>`, optional `description`.                                                                                                 |
| Lane             | flow                                        | `lane <id> "<Context>" [<Classification>]`, or `branch-lane <id> "<label>"` for an outcome route.                                                                                                         |
| Moment           | flow                                        | `moment "<label>"`, optional `[branch]`, then placements, `when` blocks and notes.                                                                                                                        |
| Placement        | moment, `when` block                        | `<lane>: <Node>`, then optional `(×N)`, `[optional]`, `[terminal]` or `[outcome]`, `cause <Cause>`, a crossing, and connections.                                                                          |
| `when` block     | moment                                      | `when <condition>` or `when <condition> [<branch-lane>]`, then placements. One arm of a branch.                                                                                                           |
| Crossing         | placement                                   | `crosses-to <lane> via <RelationshipType> contract <field>: <Type> [required] ...`                                                                                                                        |
| Connection       | placement                                   | `triggered-by <Node>`, `triggers <Node>`, `returns-to "<moment label>"`                                                                                                                                   |
| Note             | moment                                      | `note "text"` or `note <lane>: "text"`. Narration of a step outside the model. It is not a node and asserts nothing.                                                                                      |
| Field            | event, value object, projection, input      | `<name>: <Type>`, `<name>?: <Type>` when optional. See [Field types](#field-types).                                                                                                                       |

Strings are double-quoted and may span lines. A backslash escapes the next character: `\"` for a double quote, `\\` for a backslash, `\n`, `\t` and `\r` for a newline, tab and carriage return. Parsed values arrive in the IR unquoted and unescaped. Comments are `// line` and `/* block */`.

### Names

A field, an input or a lane may be named with any word, a Moment keyword included: `scope: string`, `input policy: string`, `lane context "Context" [Core]`, `trigger Started when trigger.kind = Scheduled`. A name in those places is always followed by `:` (or `?:`, or a label after `lane`), which no declaration that begins with the same word is. So `policy: string` in an event is a field and `policy P` is a declaration.

The name of a building block (a command, event, policy, value object and so on) is a plain identifier and cannot be a keyword: `command note` does not parse. The fields of a crossing's `contract` are plain identifiers too, because the next placement (`<lane>: <Node>`) has the same shape.

### A small model

```
external PaymentGateway "Card processor; not modelled here"

context "Ordering" [Core]
  description "Takes and tracks customer orders"

  aggregate "Order"
    identity orderId: UUID
    command PlaceOrder
      input customerId: UUID, total: Money
      emits OrderPlaced
    event OrderPlaced
      orderId: UUID
      total: Money

  value-object Address
    street: string
    city: string

  projection OrderSummary
    sources OrderPlaced
    description "One row per placed order"
    field orderId: UUID
    field total: Money

  query FindOrder
    reads OrderSummary
    input orderId: UUID
    description "Look up an order by id"

  rule OrdersAreImmutable "A placed order is never edited"
    enforced-by FindOrder

  rule CardDataStaysOutside "Card numbers never enter the system"
    enforced-by "the payment processor"

  term "Order" "A customer's request to buy items"

  relationship PaymentGateway -> Ordering
    type AnticorruptionLayer
    contract "charge request and result"

flow "Checkout"
  lane customer "Ordering"
  lane payments "PaymentGateway" [External]
  moment "Order placed"
    customer: PlaceOrder
    customer: OrderPlaced
    customer: OrderSummary
    customer: FindOrder
```

Flow nodes resolve to commands, events, policies, orchestrations, projections and queries. For a full model, see [TicketWave](../../examples/ticketwave/spec/ticketwave.moment): seven contexts and eight flows, from "N1 - General admission purchase" to "N8 - Waitlist offer".

The fragments in the sections below go inside a context or a flow.

### Processes, causes, notes and hops

A process records its outcomes as events. The orchestration declares them, and its commands emit them. Policies can trigger on them, projections can source from them, and flows can place them:

```
orchestration PurchaseProcess
  command StartPurchase
    input customerId: UUID
    emits PurchaseStarted
  command AbandonPurchase
    emits PurchaseAbandoned
  event PurchaseStarted
    customerId: UUID
  event PurchaseAbandoned
    customerId: UUID
  invoked-by StartPurchase
  issues RequestFraudCheck, HoldSeats
  states Started
  compensation on AbandonPurchase issues ReleaseSeats
  timeout purchaseWindow
```

A command issued for different reasons names its causes. A refusal that belongs to one cause says so, and the flow names the cause it places. A precondition with no `cause` applies to every cause. Derived negative scenarios follow the cause:

```
command CancelBooking
  causes CustomerRequest, OrganiserCancellation
  precondition WithinRefundWindow cause CustomerRequest: "The owner cancels 24 hours ahead"
  emits BookingCancelled

moment "Customer asks to cancel"
  desk: CancelBooking cause CustomerRequest
```

A branch arm can end the flow. `[terminal]` is a failure exit: the arm is a failure path. `[outcome]` is a normal outcome the business names as a result: the flow ends there and the arm is a variant, not a failure. In the IR, `[outcome]` sets `terminal: true` and `exit: 'outcome'` on the entry. A refusal stays a precondition, or a `[terminal]` when the flow shows it:

```
moment "Availability decision" [branch]
  when seats-available
    checkout: CreateCart
  when sold-out
    presale: JoinWaitlist
    presale: WaitlistJoined [outcome]
```

A step outside the model, or below its grain, is a note. A moment may hold only notes:

```
moment "Card is authorised"
  note psp: "The card network authorises the card"
```

One moment can show a whole reactive column. `triggered-by` may name a node placed earlier in the same moment when a policy declares that hop (V43):

```
moment "Order placed"
  shop: OrderPlaced
  shop: ReserveSeatsOnOrderPlaced
    triggered-by OrderPlaced
  shop: ReserveSeats
    triggered-by ReserveSeatsOnOrderPlaced
```

### Commands that record several events

A command records one or more events. `,` joins the events one transaction records together. `|` separates alternative outcomes, of which the aggregate's state decides exactly one. `when <State>` names the declared state in which an outcome is recorded.

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
  state Open -> OneUseLeft on RedeemAccessCode
  command RedeemAccessCode
    input codeId: UUID, code: string
    emits AccessCodeRedeemed when Open
        | AccessCodeRedeemed, AccessCodeExhausted when OneUseLeft
```

Read `,` as "and" and `|` as "or". `,` binds tighter than `|`. A `when` belongs to the outcome it follows. An orchestration command takes the same clause for the process events its orchestration declares. A multi-event command stays inside its own aggregate: events of another aggregate are the job of a policy.

In the IR a plain `emits A` is `emitsEvent: 'A'` and nothing else. Any other clause adds `outcomes: { events: string[]; whenState?: string }[]`, and `emitsEvent` is the first event of the first outcome. Read a command's events with `emittedEvents(cmd)` and its outcomes with `emitOutcomes(cmd)`, not from the fields.

In a flow, place after the command the events of one outcome (V47), or, in a `when` block, the events of the outcome that block shows. Derived artifacts follow: a scenario shows exactly one outcome, the events of one outcome carry the command step as their cause and share its timestamp, `moment generate` writes the later ones as `And ... emits`, `moment emit-ts` returns a tuple (`readonly [A, B]`) or a union (`A | B`), and the event catalog marks them with `recordedWith` and `alternativeTo`.

### Policy conditions

By default a policy reacts to every occurrence of its trigger. A condition narrows that:

- `when <field> = <value>`: the trigger event's own field has that value. A value is an identifier or a string; write a number as a string.
- `when <field>.kind = <Variant>`: the field is a tagged union, and the occurrence carries that variant.
- `after <Event>`: the occurrence has that event among its causes.

`when` and `after` can be combined. In the IR they are `condition: { field?, equals?, after? }` on the policy, with `field` written as declared (`decision.kind`).

```
context "Payments" [Core]
  value-object Decision
    | Approved
    | Declined
        reason: string

  aggregate "Payment"
    identity paymentId: UUID
    command SettlePayment
      input paymentId: UUID
      emits PaymentSettled
    command RefundPayment
      input paymentId: UUID
      emits PaymentRefunded
    event PaymentAuthorised
      paymentId: UUID
      channel: "web" | "box-office"
    event PaymentReviewed
      paymentId: UUID
      decision: Decision
    event PaymentSettled
      paymentId: UUID
    event PaymentRefunded
      paymentId: UUID

  policy SettleWebPayments
    trigger PaymentAuthorised when channel = "web"
    action "settle a web payment at once"
    chains-to SettlePayment

  policy RefundDeclined
    trigger PaymentReviewed when decision.kind = Declined after PaymentAuthorised
    action "refund a payment the review declined"
    chains-to RefundPayment
```

### Field types

Every field is required unless it is marked.

```
context "Intake" [Core]
  value-object ActorKind: "user" | "api" | "system"        // a named code set (a scalar value object)
  value-object ContentHash: string [pattern "^[0-9a-f]{64}$"]
  value-object RecordRef: string

  value-object Actor
    sub: string
    clientId?: string                                      // optional
    kind: ActorKind

  value-object Arrival                                     // a tagged union, discriminated by `kind`
    actor: Actor                                           // common to every variant
    | Live
    | Replay
        replay: "Bootstrap" | "Resume"                     // an inline code set
    | Document
        location: string
        contentHash?: ContentHash

  aggregate "Receipt"
    identity pointer: string
    event ReplayCompleted
      replayPoint: number{stream}                          // a map from a string key (named `stream`)
      pointer: string | recordRef: RecordRef               // exactly one of the two
      rationale?: string [encrypted]                       // recorded as {dataKeyId, ciphertext}
```

| Form                | Syntax                                                                       | IR (`FieldDefinition`)                                     |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Built-in types      | `string`, `number`, `boolean`, `UUID`, `DateTime`, `Date`, `Money`           | `type`                                                     |
| Value object type   | the value object's name                                                      | `type`                                                     |
| Optional            | `name?: T`                                                                   | `required: false`                                          |
| Array               | `T[]`                                                                        | `isArray: true`                                            |
| Map                 | `T{}` or `T{key}`, keyed by string                                           | `map: { key? }`                                            |
| Code set            | string literals joined by `\|`, inline or as `value-object Name: "a" \| "b"` | `type: 'string'`, `enum: [...]`                            |
| Scalar value object | `value-object Name: T`: the bare value, not an object                        | `ValueObjectDefinition.scalar`                             |
| Tagged union        | fields common to every variant, then `\| Variant` and its fields             | `ValueObjectDefinition.variants: { name, fields }[]`       |
| Exclusive fields    | `a: T \| b: U` on one line: exactly one is present                           | each member has `required: false` and `exclusive: [names]` |
| Pattern             | `[pattern "<regex>"]` (ECMAScript) on a string-valued type                   | `pattern`                                                  |
| Encrypted           | `[encrypted]`                                                                | `encrypted: true`                                          |
| Deprecated          | `[deprecated "<reason>" -> "<replacement field>"]`                           | `deprecated: { reason, replacement }`                      |

Attributes follow the type, in any order. A code that is a keyword or has a space needs no escaping. A one-field value object (`value: string`) stays an object; a scalar value object is how a model names an id (`value-object ConstructId: string`). The discriminator of a tagged union is always `kind`, which no field of the union may be named (V52).

`moment schema emit` writes one closed JSON Schema per event from these declarations (`@mmmnt/schema`'s `emitPayloadSchemas`).

## Validation rules

### Where a rule runs, and its severity

Rules run at two levels:

- **Syntax level** (V1 to V20, V52 to V55). These run on each file as Langium validation. Their severity is fixed, the same in a single file and in a project. The diagnostic has no `ruleId`; the id begins its `message` (`V55: ...`). V1, V9, V11, SP-01 and SP-02 check names, so in a single file they run only when the file declares both contexts and flows.
- **Model level** (V22 to V51, V56, V57). These compare names across declarations, so their severity depends on how much of the model is visible. `MomentParser.parseContent` reports them as **warnings** for a file that declares contexts, because the missing name may be in another file. `ProjectLoader.loadProject` reports them as **errors** over the merged project. The diagnostic carries the id in `ruleId`. Some findings carry their own severity in both modes: they are listed in the table below.

### Rules

| Rule | Level  | Checks                                                                                                                                                                                                                       |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1   | syntax | A placed node names a building block of its lane's context.                                                                                                                                                                  |
| V2   | syntax | `crosses-to` does not target a branch-lane.                                                                                                                                                                                  |
| V5   | syntax | `triggered-by` names a node placed earlier in the flow, in a prior moment or earlier in the same moment (V43 checks a same-moment target).                                                                                   |
| V6   | syntax | `returns-to` names the label of an earlier moment.                                                                                                                                                                           |
| V7   | syntax | An `[optional]` node has no `crosses-to`.                                                                                                                                                                                    |
| V8   | syntax | A `[terminal]` or `[outcome]` node is the last node of its block. A warning when a `when` block follows such a node in the same moment.                                                                                      |
| V9   | syntax | `crosses-to` is on an event node.                                                                                                                                                                                            |
| V10  | syntax | A moment contains at least one node, `when` block or note.                                                                                                                                                                   |
| V11  | syntax | A multiplicity `(×N)` is on an event node.                                                                                                                                                                                   |
| V12  | syntax | A deprecated field's replacement is a sibling field. A warning.                                                                                                                                                              |
| V13  | syntax | The lane of a placement or a note is a declared lane.                                                                                                                                                                        |
| V14  | syntax | A `Partnership` crossing has a reverse crossing. A warning.                                                                                                                                                                  |
| V16  | syntax | A branch-lane is used by some `when` block or placement. A warning.                                                                                                                                                          |
| V17  | syntax | No `returns-to` loop nests inside another. A warning.                                                                                                                                                                        |
| V18  | syntax | An annotation is `@classification`, `@retention` or `@encryption`.                                                                                                                                                           |
| V19  | syntax | An annotation is followed by a declaration. A warning.                                                                                                                                                                       |
| V20  | syntax | A declared `triggers` or `triggered-by` direction agrees with the flow's order. A warning.                                                                                                                                   |
| V22  | model  | Every projection source is a declared event.                                                                                                                                                                                 |
| V23  | model  | Every name a query reads is a declared projection or value object.                                                                                                                                                           |
| V24  | model  | A rule with a declared enforcer is enforced by a service or query of its context.                                                                                                                                            |
| V25  | model  | A value object is declared at most once per context.                                                                                                                                                                         |
| V26  | model  | A glossary term is defined at most once per context.                                                                                                                                                                         |
| V27  | model  | Every relationship end is a declared context or external, and every `[External]` lane names a declared external.                                                                                                             |
| V28  | model  | Every service `consumes` and `produces` a declared event or value object.                                                                                                                                                    |
| V29  | model  | Every policy chains to a command of an aggregate or an orchestration.                                                                                                                                                        |
| V30  | model  | Every policy is triggered by a declared domain event.                                                                                                                                                                        |
| V31  | model  | Every event an orchestration command emits is one its orchestration declares.                                                                                                                                                |
| V32  | model  | An orchestration is invoked by one of its own commands.                                                                                                                                                                      |
| V33  | model  | Every command an orchestration issues is an aggregate command or an operation of a declared external.                                                                                                                        |
| V34  | model  | Every orchestration step advances on one of its own commands, and some policy chains to that command.                                                                                                                        |
| V35  | model  | `compensation none` stands alone. Every other compensation is on one of the orchestration's own commands and issues resolvable commands.                                                                                     |
| V36  | model  | An aggregate with states has exactly one initial state, transitions only on its own commands, and reaches every state from the initial one.                                                                                  |
| V37  | model  | Every gateway `consumes` and `produces` a declared event or value object.                                                                                                                                                    |
| V38  | model  | Every event an aggregate command emits is declared somewhere in the model.                                                                                                                                                   |
| V39  | model  | Every `triggers` target is a node placed in the same flow.                                                                                                                                                                   |
| V40  | model  | An event is declared by one owner, an aggregate or an orchestration.                                                                                                                                                         |
| V41  | model  | A `cause` on a precondition or a placement is one of the command's declared `causes`.                                                                                                                                        |
| V42  | model  | A command with cause-scoped preconditions is placed with its `cause`.                                                                                                                                                        |
| V43  | model  | A same-moment `triggered-by` is a hop a policy declares. An error even in a single file when the node or its cause is a policy; otherwise model-level severity, since the supporting policy may be in another file.          |
| V44  | model  | A command that records more than one distinct event records only events its own aggregate declares.                                                                                                                          |
| V45  | model  | An event is listed once inside one outcome. It may appear in several outcomes.                                                                                                                                               |
| V46  | model  | A `when` guard names a declared state of the aggregate or orchestration, no two outcomes share a state, and a command guards every outcome or none. An error in both modes. Alternatives with no guard at all are a warning. |
| V47  | model  | The events a flow places after one placement of a multi-event command come from one outcome. Placing only part of an outcome is a warning.                                                                                   |
| V48  | model  | Every outcome of a command with alternatives is placed by some flow. A warning, checked over a merged project only.                                                                                                          |
| V49  | model  | A policy's `when <field> = <value>` names a field of its trigger event; for a path, its first segment. A guard on a field named `outcome` is allowed.                                                                        |
| V50  | model  | A policy's `after <Event>` names a declared event.                                                                                                                                                                           |
| V51  | model  | Some flow places a policy's `after` event before its trigger. A warning, reported only when some flow places the trigger.                                                                                                    |
| V52  | syntax | No field of a tagged union, common or of a variant, is named `kind`.                                                                                                                                                         |
| V53  | syntax | A union names each variant once, and a code set lists each code once.                                                                                                                                                        |
| V54  | syntax | A member of an exclusive group `a: T \| b: U` is not marked `?`.                                                                                                                                                             |
| V55  | syntax | A `[pattern]` is a valid regular expression on a string-valued type (`string`, `UUID`, `DateTime`, `Date`, a code set, or a scalar value object of one).                                                                     |
| V56  | model  | A policy's `when` path is `<field>.kind` on a single (not array, not map) tagged-union field of its trigger, and a union field is guarded only through `.kind`.                                                              |
| V57  | model  | The variant a `when <field>.kind = <Variant>` guard names is declared by the field's union.                                                                                                                                  |

Every syntax-level rule is an error unless the table says it is a warning. V3, V4, V15 and V21 are not implemented.

### Structural and project checks

| Rule  | Reported by                                         | Checks                                                              |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------- |
| SP-01 | `SchemaValidator.validate`, and the parser (syntax) | A lane label, or a connection's target, is a declared context.      |
| SP-02 | `SchemaValidator.validate`, and the parser (syntax) | A crossing's event is declared by its source or its target context. |
| SP-03 | `SchemaValidator.validate`, and the parser (syntax) | A crossing's contract has at least one field.                       |
| SP-04 | `SchemaValidator.validate`                          | A `returns-to` lands on a prior moment of the same flow.            |
| SP-05 | `SchemaValidator.validateManifestFiles`             | Every file the manifest references exists.                          |
| PM-00 | `ProjectLoader`                                     | A project file can be read.                                         |
| PM-01 | `mergeIrs`                                          | A context is defined in exactly one file.                           |
| PM-02 | `validateCrossFileReferences`                       | A flow lane names a context defined in some loaded file.            |
| PM-03 | `validateCrossFileReferences`                       | A crossing's target context is defined in some loaded file.         |
| PM-04 | `validateCrossFileReferences`                       | A crossing's event is declared in its target context. A warning.    |
| PM-05 | `validateCrossFileReferences`                       | A placed node's context is defined in some loaded file.             |
| PM-06 | `validateCrossFileReferences`                       | A relationship's ends are defined in some loaded file.              |
| PM-07 | `validateCrossFileReferences`                       | A node on a context's lane names a building block of that context.  |

`MomentParser.parseContent` runs `SchemaValidator.validate` on every file that declares contexts and reports its findings as warnings. The parser's own SP-01 to SP-03 checks are errors.

## API reference

### Parser

| Export                    | Description                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `MomentParser`            | `parseContent(content, filePath?)` resolves to a `ParseResult`: `success`, the IR (when there are no errors) and every diagnostic. |
| `astToIr(ast, metadata?)` | Turns a Langium `MomentFile` syntax tree into an `IntermediateRepresentation`. `parseContent` calls it for you.                    |

### Loading a specification

| Export                             | Description                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadSpecification(path)`          | Loads a path that exists: a directory as one project through `ProjectLoader`, a file through `MomentParser`. Resolves to a `LoadedSpecification` (a `ParseResult` plus `isProject` and `files`). The CLI and the MCP server load models with it.          |
| `specificationFiles(path)`         | The `.moment` files a path names: the file itself, or every one beneath a directory, sorted.                                                                                                                                                              |
| `isDirectory(path)`                | True when the path exists and is a directory.                                                                                                                                                                                                             |
| `ProjectLoader`                    | `loadProject(filePaths, metadataOverride?)` parses each file, merges the IRs, runs the cross-file checks and the model-level rules over the merge, and resolves to a `ProjectLoadResult` (`success`, `ir`, `diagnostics`, `filesParsed`, `filesErrored`). |
| `mergeIrs(irs, metadataOverride?)` | Concatenates IRs in the given order and reports a context defined twice (PM-01). Returns a `MergeResult` (`ir`, `diagnostics`).                                                                                                                           |
| `validateCrossFileReferences(ir)`  | Checks that flow lanes, nodes, crossings and relationships in a merged IR resolve (PM-02 to PM-07). Returns a `CrossFileValidationResult` (`valid`, `diagnostics`).                                                                                       |

### IR helpers

| Export                                | Description                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `emittedEvents(cmd)`                  | Every distinct event a command can record, in declaration order.                                                                       |
| `emitOutcomes(cmd)`                   | A command's outcomes. A plain `emits A` reads as one outcome of one event; an orchestration command with no `emits` has none.          |
| `matchEmitOutcome(outcomes, placed)`  | The index of the outcome whose events are exactly `placed`, else the first that holds them all, else -1.                               |
| `EmitsFields`                         | The `emitsEvent` and `outcomes` fields these helpers read.                                                                             |
| `momentPlacements(moment, commandOf)` | Every placement of a command in a moment, along each path through it, with the event steps the flow places for it (`MomentPlacement`). |
| `conditionPath(written)`              | Splits a policy's `when` field: `decision.kind` is `{ field: 'decision', path: ['kind'] }`.                                            |
| `UNION_DISCRIMINATOR`                 | `'kind'`, the property that holds a union value's variant.                                                                             |

### IR types

```
IntermediateRepresentation
  contexts: ContextDefinition[]
    aggregates: AggregateDefinition[]      identityField, commands, events, valueObjects, invariants, states?
    commands, events                       every aggregate's commands and events, flat; events include process events
    domainServices, policies, sagas, valueObjects, invariants, projections?, queries?, rules?
  flows: FlowDefinition[]
    lanes: LaneDefinition[]
    moments: MomentDefinition[]            contextEntries, branches?, sequence?, notes?
    connections: ConnectionDefinition[]
  glossary: GlossaryEntry[]
  relationships: ContextRelationship[]
  externals?: ExternalDefinition[]
  metadata: SpecificationMetadata
```

| Type                                                                                                              | Description                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IntermediateRepresentation`                                                                                      | Contexts, flows, glossary, relationships, externals and metadata.                                                                                                                  |
| `SpecificationMetadata`                                                                                           | Name, version, and optional description and generation time.                                                                                                                       |
| `ContextDefinition`                                                                                               | A bounded context and its classification, description and members.                                                                                                                 |
| `AggregateDefinition`                                                                                             | An aggregate with its identity field, commands, events, value objects, invariants, annotations and optional `states`.                                                              |
| `AggregateStatesDefinition`                                                                                       | `initial`, every `initials` written (so V36 can see a second one), and `transitions` (`from`, `to`, `command`).                                                                    |
| `CommandDefinition`                                                                                               | Inputs, optional `causes`, preconditions, `emitsEvent` and, for anything but the plain `emits A`, `outcomes`.                                                                      |
| `EmitOutcomeDefinition`                                                                                           | The `events` one transaction records together, and the `whenState` in which that outcome is recorded.                                                                              |
| `PreconditionDefinition`                                                                                          | Name, description, and the `causes` it applies to (absent means every cause).                                                                                                      |
| `EventDefinition`, `EventOwner`                                                                                   | A domain event with its fields and its `owner` (`{ kind: 'aggregate' \| 'orchestration', name }`).                                                                                 |
| `ValueObjectDefinition`, `VariantDefinition`                                                                      | A value object: a record (`fields`), a `scalar`, or a tagged union (`variants`, each with a `name` and `fields`).                                                                  |
| `FieldDefinition`                                                                                                 | `name`, `type`, `isArray`, `required`, and when declared `enum`, `map`, `pattern`, `encrypted`, `exclusive` and `deprecated`.                                                      |
| `InvariantDefinition`                                                                                             | A business invariant of an aggregate, with its scope.                                                                                                                              |
| `DomainServiceDefinition`                                                                                         | A stateless service that consumes and produces a named event or value object.                                                                                                      |
| `PolicyDefinition`, `PolicyConditionDefinition`                                                                   | A policy: its `trigger` event, `action`, `chainsTo` command, gateways, and optional `condition` (`field` and `equals`, and/or `after`).                                            |
| `SagaDefinition`                                                                                                  | An orchestration (`keyword` is `orchestration` or `saga`): `trigger`, `startEvent`, `states`, `transitions`, `commands`, `events`, `issues`, `compensations`, `timeout`, gateways. |
| `SagaTransitionDefinition`, `OrchestrationCommandDefinition`, `IssuedCommandDefinition`, `CompensationDefinition` | The parts of an orchestration.                                                                                                                                                     |
| `ProjectionDefinition`                                                                                            | A read model built from source events, with its fields and gateways.                                                                                                               |
| `QueryDefinition`                                                                                                 | A query over projections or value objects, with its inputs.                                                                                                                        |
| `RuleDefinition`                                                                                                  | A context-level rule, its `enforcedBy`, and `enforcerKind` (`declared` or `external`).                                                                                             |
| `GatewayDefinition`                                                                                               | A gateway on a projection, policy, orchestration or external.                                                                                                                      |
| `ExternalDefinition`                                                                                              | An external system: a relationship end or an `[External]` lane.                                                                                                                    |
| `ContextRelationship`                                                                                             | A relationship between two contexts or externals, with its type and contract.                                                                                                      |
| `AnnotationDefinition`                                                                                            | A `classification`, `retention` or `encryption` annotation and its value.                                                                                                          |
| `FlowDefinition`, `LaneDefinition`                                                                                | A flow with its lanes, moments and connections. A lane names its context and whether it is a branch-lane.                                                                          |
| `MomentDefinition`                                                                                                | A moment: `contextEntries`, `branches`, `isBranch`, `terminal`, `notes`, and `sequence`, the source order of its entries, branches and notes.                                      |
| `MomentEntry`                                                                                                     | A placed node: `nodeKind` (command, event, policy, saga, projection or query), `multiplicity`, `optional`, `terminal`, `exit` (`'outcome'`), and `cause`.                          |
| `MomentSequenceItem`, `MomentNote`                                                                                | One child of a moment in source order; a note's `text` and optional `laneId`.                                                                                                      |
| `BranchDefinition`                                                                                                | A `when` arm: its condition, optional branch-lane and entries.                                                                                                                     |
| `ConnectionDefinition`, `ConnectionType`                                                                          | A connection between nodes or moments: `crosses-to` (with a `schemaContract`), `triggered-by`, `triggers` or `returns-to`. A connection inside an arm has `branchCondition`.       |
| `SchemaContract`, `SchemaFieldDefinition`                                                                         | The field contract of a crossing.                                                                                                                                                  |
| `GlossaryEntry`                                                                                                   | A glossary term, its definition and context.                                                                                                                                       |

### Results and diagnostics

| Type               | Description                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `ParseResult`      | `success`, the IR when there are no errors, and `diagnostics`.                                 |
| `ValidationResult` | `valid` and `diagnostics`.                                                                     |
| `Diagnostic`       | `severity` (`error`, `warning` or `info`), `message`, optional `ruleId` and optional `source`. |
| `SourceLocation`   | File, 1-based line and column, and optional end line and end column.                           |

### Import

| Export                      | Description                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SiftSpecificationImporter` | `import(input, options?)` maps Sift building blocks and timeline events to context and flow file entries plus an upstream fingerprint. `generateContextFile(block)` and `generateFlowFile(event)` return `.moment` source. It does no file I/O; `SiftEventStreamReader` in `@mmmnt/sync` reads a `.domain/` directory. |
| `SiftBuildingBlock`         | A Sift building block describing one bounded context.                                                                                                                                                                                                                                                                  |
| `SiftTimelineEvent`         | A Sift timeline event describing one flow.                                                                                                                                                                                                                                                                             |
| `SiftImportInput`           | Source product and version, building blocks and timeline events.                                                                                                                                                                                                                                                       |
| `ImportResult`              | Context and flow file references, manifest entries, fingerprint and diagnostics.                                                                                                                                                                                                                                       |
| `UpstreamFingerprint`       | Source, version, content hash and import time of the upstream specification.                                                                                                                                                                                                                                           |

### Manifest

| Export                                             | Description                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ManifestScaffolder`                               | `scaffold(targetDir, options)` writes `.manifest.yaml` and creates `.moment/contexts/` and `.moment/flows/`. Throws if a manifest already exists.                                                 |
| `ManifestReader`                                   | `readManifest(path)` reads and parses a `.manifest.yaml` into a `ManifestConfiguration`.                                                                                                          |
| `ManifestUpdater`                                  | `updateFromDirectory(projectDir)` and `updateFromParsedFile(projectDir, filePath, contextNames, flowNames)` add new context and flow files to the manifest. Both return a `ManifestUpdateResult`. |
| `ScaffoldOptions`, `ScaffoldResult`                | The project name and optional version and description; the manifest path and the directories created.                                                                                             |
| `ManifestUpdateResult`                             | Whether the manifest changed, and how many contexts and flows were added.                                                                                                                         |
| `ManifestConfiguration`                            | Name, version, optional description, context and flow file references, generator configs and watch configuration.                                                                                 |
| `FileRef`, `GeneratorConfig`, `WatchConfiguration` | A named file reference; an output format (`typescript`, `gherkin` or `markdown`) and its directory; whether watching is on, the debounce and the watched paths.                                   |

### Generators

| Export                                                                               | Description                                                                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GeneratorRegistry`                                                                  | `register`, `resolve`, `has`, `getAll`, `getFormats`, and `planExecutionOrder(formats?)`, which orders generators by their dependencies. |
| `GeneratorDescriptor`, `GeneratorRunContext`, `GeneratorRunResult`, `GeneratorScope` | The contract a generator package implements.                                                                                             |

### Services and infrastructure

| Export                          | Description                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SchemaValidator`               | `validate(ir)` runs SP-01 to SP-04. `validateManifestFiles(files, fileExists)` runs SP-05.                                                                                                   |
| `FileWatcher`                   | Watches the configured paths for `.moment`, `.yaml` and `.yml` changes and calls back after a debounce. Built on chokidar. Takes `FileWatcherOptions` (`rootDir`, `config`, `onFileChange`). |
| `RegenerateOnMomentFileChanged` | Re-parses a changed file. `onFileChanged(path)` resolves to a `RegenerateResult` (`filePath`, `parseResult`).                                                                                |

## Examples

### Parsing and inspecting a specification

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser, emittedEvents } from '@mmmnt/core';

const path = 'examples/ticketwave/spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);

for (const d of result.diagnostics) {
  const at = d.source ? `${d.source.file}:${d.source.line}:${d.source.column}` : path;
  console.log(`[${d.severity}] ${at} ${d.message}`);
}

if (result.ir) {
  for (const ctx of result.ir.contexts) {
    console.log(`Context: ${ctx.name}`);
    for (const agg of ctx.aggregates) {
      console.log(`  Aggregate: ${agg.name}`);
      for (const cmd of agg.commands) {
        console.log(`    ${cmd.name} -> ${emittedEvents(cmd).join(', ')}`);
      }
    }
  }

  for (const flow of result.ir.flows) {
    console.log(`Flow: ${flow.name} (${flow.moments.length} moments)`);
  }
}
```

### Loading a model directory

```typescript
import { loadSpecification } from '@mmmnt/core';

// A directory loads as one project; a file loads on its own.
const spec = await loadSpecification('examples/ticketwave/spec');

console.log(`${spec.files.length} file(s), project: ${spec.isProject}`);
for (const d of spec.diagnostics) {
  console.log(`[${d.severity}] ${d.ruleId ?? ''} ${d.message}`);
}
if (spec.success && spec.ir) {
  console.log(`Contexts: ${spec.ir.contexts.length}`);
}
```

To choose the files yourself, call `ProjectLoader` directly:

```typescript
import { ProjectLoader, specificationFiles } from '@mmmnt/core';

const files = specificationFiles('examples/ticketwave/spec');
const project = await new ProjectLoader().loadProject(files);

console.log(`${project.filesParsed} file(s) parsed, ${project.filesErrored} with errors`);
if (project.success) {
  console.log(`Flows: ${project.ir.flows.map((f) => f.name).join(', ')}`);
}
```

### Importing from Sift

```typescript
import { SiftSpecificationImporter } from '@mmmnt/core';
import { SiftEventStreamReader } from '@mmmnt/sync';

// Replay the Sift JSONL event stream in .domain/
const { input } = new SiftEventStreamReader().read('.domain');

const importer = new SiftSpecificationImporter();
const result = importer.import(input);

console.log(`Contexts: ${result.contextFiles.map((f) => f.path).join(', ')}`);
console.log(`Upstream fingerprint: ${result.fingerprint.hash}`);

// .moment source for each bounded context
for (const block of input.buildingBlocks) {
  const source = importer.generateContextFile(block);
}
```

### Scaffolding a new project

```typescript
import { ManifestScaffolder } from '@mmmnt/core';

const result = new ManifestScaffolder().scaffold('.', { name: 'my-service' });

// Creates:
//   ./.manifest.yaml
//   ./.moment/contexts/
//   ./.moment/flows/
console.log(`Manifest: ${result.manifestPath}`);
console.log(`Directories: ${result.directoriesCreated.join(', ')}`);
```

### Watch mode

```typescript
import { FileWatcher, RegenerateOnMomentFileChanged } from '@mmmnt/core';

const policy = new RegenerateOnMomentFileChanged();

const watcher = new FileWatcher({
  rootDir: '.',
  config: { enabled: true, debounceMs: 300, paths: ['.moment/contexts', '.moment/flows'] },
  onFileChange: async (filePath) => {
    console.log(`File changed: ${filePath}`);
    const { parseResult } = await policy.onFileChanged(filePath);
    if (parseResult.success && parseResult.ir) {
      console.log(
        `Re-parsed: ${parseResult.ir.contexts.length} contexts, ${parseResult.ir.flows.length} flows`,
      );
    } else {
      console.log(`Parse errors: ${parseResult.diagnostics.length}`);
    }
  },
});

watcher.start();
// later: watcher.stop();
```

## Integration

`@mmmnt/core` depends on no other `@mmmnt` package. The rest of the toolchain reads its IR:

```
@mmmnt/core
  |
  +-- @mmmnt/derive      (test topologies, simulations, event catalogs, impact analysis)
  +-- @mmmnt/emit-ts     (TypeScript types and test scaffolds)
  +-- @mmmnt/generate    (Gherkin, specification documents, AsyncAPI)
  +-- @mmmnt/viz         (context maps, flow timelines)
  +-- @mmmnt/board       (the IR projected onto an NDD board)
  +-- @mmmnt/schema      (schema lifecycle governance, payload JSON Schemas)
  +-- @mmmnt/harness     (test execution, through derive)
  +-- @mmmnt/sync        (drift detection, through emit-ts)
  +-- @mmmnt/cli         (the moment command)
  +-- @mmmnt/mcp         (Moment tools over the Model Context Protocol)
```

## Changelog

Per-release changes are in [CHANGELOG.md](CHANGELOG.md).

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/core
pnpm --filter @mmmnt/core test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

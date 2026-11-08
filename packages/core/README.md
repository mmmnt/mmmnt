# @mmmnt/core

Parser and intermediate representation for the Moment domain specification language.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/core.svg)](https://www.npmjs.com/package/@mmmnt/core)

## Overview

`@mmmnt/core` is the foundation package of the Moment toolchain. It provides a Langium-based parser for `.moment` specification files and transforms the resulting abstract syntax tree into a typed Intermediate Representation (IR) that all downstream packages consume.

The `.moment` DSL lets you describe bounded contexts, aggregates, commands, events, policies, orchestrations, projections, queries, rules, glossary terms, external systems, and the flows that connect them. Rather than scattering domain knowledge across code comments, wiki pages, and tribal memory, you define the authoritative model in one place -- a single file, or a directory of files loaded as one project. The core package parses these specifications, validates them against the grammar and the model rules, and produces a structured IR that tools like code generators, test harnesses, and visualization engines can work with directly.

This package also includes the Sift specification importer, which turns Sift building blocks into `.moment` source, and the manifest scaffolder for initializing new Moment projects. Together these capabilities make `@mmmnt/core` the single entry point for getting domain specifications into the Moment pipeline, whether you are writing them by hand, importing them from an upstream tool, or starting a brand-new project from scratch.

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

## Quick Start

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';

// Parse a .moment specification file
const path = 'path/to/spec.moment';
const parser = new MomentParser();
const result = await parser.parseContent(readFileSync(path, 'utf-8'), path);

if (result.success && result.ir) {
  console.log(`Contexts: ${result.ir.contexts.length}`);
  console.log(`Flows: ${result.ir.flows.length}`);
}

// Errors make success false; warnings (including V22–V43 advisories) leave it true
for (const d of result.diagnostics) {
  console.log(`[${d.severity}] ${d.ruleId ?? ''} ${d.message}`);
}
```

## Key Features

- **Langium-based parser** -- full grammar definition with error recovery and precise diagnostic messages pointing to the exact line and column of issues.
- **Typed Intermediate Representation** -- a normalized, strongly-typed IR that downstream packages consume without needing to understand the raw AST.
- **Project mode** -- `ProjectLoader` parses many `.moment` files and merges them into one IR, resolving names across files and checking cross-file references.
- **Model completeness, palette and reference rules** -- V22–V43 check that projections, queries, rules, services, relationships, lanes, policies, orchestrations, aggregate states, gateways, emitted events and `triggers` targets name things the model declares (see [Validation Rules](#validation-rules)).
- **Sift specification import** -- converts Sift building blocks into `.moment` context and flow source, with an upstream fingerprint for drift tracking.
- **Manifest scaffolding** -- initializes new Moment projects with a `.manifest.yaml` and the `.moment/contexts/` and `.moment/flows/` directories.
- **File watching** -- monitors `.moment` and manifest files for changes and triggers debounced callbacks for live development workflows.
- **Structural IR validation** -- the `SchemaValidator` service runs structural checks on an IR and verifies manifest file references.
- **Diagnostic pipeline** -- syntax errors, validation errors, and warnings with rule ids and source locations suitable for IDE integration.
- **Deterministic output** -- the same input specification always produces the same IR; project files are merged in sorted path order.

## Grammar

A `.moment` file may hold contexts, flows, external systems, or any mix of them. Since 0.6.0 the grammar covers the full NDD palette:

| Construct | Where | Syntax |
|-----------|-------|--------|
| External system | top level | `external <Name> "<description>"`, optionally followed by gateways. Usable as a relationship end and as an `[External]` lane. |
| Projection | context | `projection <Name>` `sources <Event>, ...`, then optional `description "<text>"`, `field <name>: <Type>` lines, and gateways. |
| Query | context | `query <Name>` `reads <Projection or ValueObject>, ...`, then optional `input <name>: <Type>, ...` and `description "<text>"`. |
| Rule | context | `rule <Id> "<description>" enforced-by <ServiceOrQuery>`, or `enforced-by "<external enforcer>"`. |
| Value object | context or aggregate | `value-object <Name>` followed by fields. |
| Glossary term | context | `term "<term>" "<definition>"` |
| Policy | context | `policy <Name> trigger <Event> [when <field> = <value>] [after <Event>] action "<text>" chains-to <Command>` -- one domain event, one command. `when` and `after` (ADR-045) say which occurrences of the trigger the policy reacts to; a number value is written as a string. |
| Orchestration | context | `orchestration <Name>` (`saga` is an alias) with its own `command`s, the `event`s those commands emit, `invoked-by`, `issues`, `states`, `compensation` and `timeout`. |
| Process event | orchestration | `event <Name>` with fields, declared inside an orchestration. An orchestration command emits it with `emits`. It is a domain event owned by the process. |
| Emits clause | command | `emits A` records one event. `emits A, B` records both in one transaction. `emits A \| B` records one of them, chosen by the aggregate's state. `emits A when Open \| A, B when OneUseLeft` names the declared state that chooses each outcome (ADR-041). |
| Cause | command, precondition, node | `causes A, B` on a command; `cause A` on a precondition limits it to that cause; `cause A` after a node placement says the command is issued for A. |
| Note | moment | `note "text"` or `note <lane>: "text"`. Narration of a step outside the model. It is not a node and asserts nothing. |
| Aggregate states | aggregate | `state initial <Name>` and `state <From> -> <To> on <Command>`, written right after the identity. |
| Gateway | projection, policy, orchestration, external | `gateway <Name> consumes <Event or ValueObject> produces <Event or ValueObject>`, with optional `description`. |

Strings are double-quoted and may span lines. A backslash escapes the next character: `\"` for a double quote, `\\` for a backslash, `\n`, `\t` and `\r` for a newline, tab and carriage return. Parsed values arrive in the IR unquoted and unescaped.

Flow nodes resolve to commands, events, policies, orchestrations, projections and queries. A minimal example using the newer constructs:

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

### Processes, causes, notes and hops

Four additions (ADR-040) model what recurs in process-manager and Event Storming work. `cause`, `causes` and `note` are keywords; a field, input or lane named so keeps parsing. A node named `note` or `cause` is the one source break.

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

A command issued for different reasons names its causes. A refusal that belongs to one cause says so, and the flow names the cause it places. A precondition with no `cause` applies to every cause. Derived negative scenarios then follow the cause:

```
command CancelBooking
  causes CustomerRequest, OrganiserCancellation
  precondition WithinRefundWindow cause CustomerRequest: "The owner cancels 24 hours ahead"
  emits BookingCancelled

moment "Customer asks to cancel"
  desk: CancelBooking cause CustomerRequest
```

A branch arm ends the flow at an exit. `[terminal]` is a failure exit: the arm is a failure path. `[outcome]` is a normal outcome the business names as a result: the flow ends there and the arm is a variant, not a failure. A refusal stays a precondition, or a `[terminal]` when the flow shows it:

```
moment "Availability decision" [branch]
  when seats-available
    checkout: CreateCart
  when sold-out
    presale: JoinWaitlist
    presale: WaitlistJoined [outcome]
```

A step outside the model, or below its grain, is a note. A moment may be only notes:

```
moment "Card is authorised"
  note psp: "The card network authorises the card"
```

One moment can show a whole reactive column. `triggered-by` may name a node placed earlier in the same moment when a policy declares the hop (V43):

```
moment "Order placed"
  shop: OrderPlaced
  shop: ReserveSeatsOnOrderPlaced
    triggered-by OrderPlaced
  shop: ReserveSeats
    triggered-by ReserveSeatsOnOrderPlaced
```

To migrate: a stand-in node that only held a place in a moment becomes a `note`, and two moments that told one beat become one moment with hops.

### Commands that record several events

A command records one or more events (ADR-041), as the palette's "command produces event(s) or a rejection" says. `,` joins the events one transaction records together. `|` separates alternative outcomes, of which the aggregate's state decides exactly one. `when <State>` names the declared state in which an outcome is recorded. `emits A` alone is the same as before; the IR of a model that uses only that form does not change.

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

Read `,` as "and", and `|` as "or". `,` binds tighter than `|`. A `when` belongs to the outcome it follows. An orchestration command takes the same clause for the process events the orchestration declares. A multi-event command stays inside its own aggregate: events of another aggregate are the job of a policy.

In the IR a plain `emits A` is `emitsEvent: 'A'` and nothing else. Any other clause adds `outcomes: { events: string[]; whenState?: string }[]`, and `emitsEvent` is the first event of the first outcome. Read a command's events with `emittedEvents(cmd)` and its outcomes with `emitOutcomes(cmd)`, not from the fields.

In a flow, place the events the command records after it. All the events of one outcome (V47), or the events of the outcome one `when` block shows. Derived artifacts follow: a scenario shows exactly one outcome, the events of one outcome carry the command step as their cause and share its timestamp, `moment generate` writes the later ones as `And ... emits`, `moment emit-ts` returns a tuple (`readonly [A, B]`) or a union (`A | B`), and the event catalog marks them with `recordedWith` and `alternativeTo`.

The grammar source is [`src/grammar/moment.langium`](src/grammar/moment.langium).

## Validation Rules

V22–V43 compare names across declarations, so their severity depends on how much of the model the parser can see. `MomentParser.parseContent` reports them as **warnings** for a single file that declares contexts; `ProjectLoader.loadProject` reports them as **errors** over the merged project, where a missing name is genuinely missing. Each diagnostic carries its id in `ruleId`. The exception is V43, which is an **error** in a single file whenever the file declares the policy that the hop involves.

| Rule | Checks |
|------|--------|
| V5 | `triggered-by` names a node that appears earlier in the flow in source order, in a prior moment or earlier in the same moment (V43 checks a same-moment target). |
| V10 | A moment contains at least one node, `when` block or note. |
| V22 | Every projection source is a declared event. |
| V23 | Every name a query reads is a declared projection or value object. |
| V24 | A rule with a declared enforcer is enforced by a service or query of its context. |
| V25 | A value object is declared at most once per context. |
| V26 | A glossary term is defined at most once per context. |
| V27 | Every relationship end is a declared context or external, and every `[External]` lane names a declared external. |
| V28 | Every service `consumes` and `produces` a declared event or value object. |
| V29 | Every policy chains to a command of an aggregate or an orchestration. |
| V30 | Every policy is triggered by a declared domain event. |
| V31 | Every event of every outcome of an orchestration command is one the orchestration declares, never an aggregate's event. |
| V32 | An orchestration is invoked by one of its own commands. |
| V33 | Every command an orchestration issues is an aggregate command or an operation of a declared external. |
| V34 | Every orchestration step advances on one of its own commands, and some policy chains to that command. |
| V35 | `compensation none` stands alone; every other compensation is on one of the orchestration's own commands and issues resolvable commands. |
| V36 | An aggregate with states has exactly one initial state, transitions only on its own commands, and every state is reachable from the initial one. |
| V37 | Every gateway `consumes` and `produces` a declared event or value object. |
| V38 | Every event of every outcome of an aggregate command is declared somewhere in the model. |
| V39 | Every `triggers` target is a node placed in the same flow (`triggered-by` targets are checked by V5). |
| V40 | An event is declared by one owner, an aggregate or an orchestration. |
| V41 | A `cause` on a precondition or a placement is one of the command's declared `causes`. |
| V42 | A command with cause-scoped preconditions is placed with its `cause`. |
| V43 | A same-moment `triggered-by` is a hop a policy declares. An error even in a single file when the node or the cause is a policy the file declares; an advisory per file otherwise (the supporting policy may be in another file). |
| V44 | A command that records more than one distinct event records only events its own aggregate declares. A single-event command is unchanged. |
| V45 | An event is listed once inside one outcome; it may appear in several outcomes. |
| V46 | A `when` guard names a declared state of the aggregate (or orchestration), no two outcomes carry the same state, and a command guards every outcome or none. Alternatives with no guard are an advisory. |
| V47 | The events a flow places after one placement of a multi-event command come from one outcome. Part of an outcome is an advisory. |
| V48 | Every outcome of a command with alternatives is placed by some flow. An advisory, over a merged project only. |
| V49 | A policy's `when <field> = <value>` names a field its trigger event declares (ADR-045). A guard on a field named `outcome` is allowed. |
| V50 | A policy's `after <Event>` names a declared event. |
| V51 | A policy's `after <Event>` is placed before its trigger by some flow. An advisory, and only when a flow places the trigger. |

Because these rules can report errors on a model that parsed under 0.5.0, check a model directory with `moment parse <dir>` (from `@mmmnt/cli`) after upgrading.

## API Reference

### Parser

| Export | Description |
|--------|-------------|
| `MomentParser` | Langium-based parser. `parseContent(content, filePath?)` resolves to a `ParseResult` with the IR (when there are no errors) and every diagnostic. |
| `astToIr(ast, metadata?)` | Transforms a Langium `MomentFile` AST into an `IntermediateRepresentation`. `parseContent` calls it for you. |

### Project

| Export | Description |
|--------|-------------|
| `ProjectLoader` | `loadProject(filePaths, metadataOverride?)` parses each file, merges the IRs, runs cross-file validation and V22–V48, and resolves to a `ProjectLoadResult` (`success`, `ir`, `diagnostics`, `filesParsed`, `filesErrored`). |
| `mergeIrs(irs, metadataOverride?)` | Concatenates IRs in the given order and reports duplicate context names. Returns a `MergeResult`. |
| `validateCrossFileReferences(ir)` | Checks that flow lanes, crossings and relationships in a merged IR resolve. Returns a `CrossFileValidationResult`. |

### Intermediate Representation Types

| Type | Description |
|------|-------------|
| `IntermediateRepresentation` | Top-level IR containing contexts, flows, glossary, relationships, externals, and metadata. |
| `SpecificationMetadata` | Specification name, version, and optional description and generation time. |
| `ContextDefinition` | A bounded context with its aggregates, commands, events, value objects, invariants, policies, sagas, domain services, projections, queries, and rules. |
| `AggregateDefinition` | An aggregate root with its identity field, commands, events, invariants, value objects, and optional internal states. |
| `AggregateStatesDefinition` | An aggregate's initial state and command-driven state transitions. |
| `CommandDefinition` | A command with its input fields, `causes`, preconditions, `emitsEvent` (the first event it emits) and, for anything but the plain `emits A`, `outcomes`. |
| `EmitOutcomeDefinition` | Events recorded together in one transaction, and the `whenState` in which that outcome is recorded. |
| `emittedEvents(cmd)` · `emitOutcomes(cmd)` | Every distinct event a command can record, and its outcomes. Read a command through these. |
| `EventDefinition` | A domain event with its payload fields and its `owner` (an aggregate or an orchestration). |
| `ValueObjectDefinition` | A value object with its fields. |
| `FieldDefinition` | A typed field within a command, event, value object, projection, or query. |
| `InvariantDefinition` | A business invariant that must hold for an aggregate. |
| `PolicyDefinition` | A reactive policy: one triggering domain event and the command it chains to, and the optional `condition` (`PolicyConditionDefinition`: `field` and `equals`, and/or `after`) under which it reacts. |
| `SagaDefinition` | An orchestration (written `orchestration` or `saga`) with its commands, issued commands, states, compensations, and timeout. |
| `SagaTransitionDefinition`, `OrchestrationCommandDefinition`, `IssuedCommandDefinition`, `CompensationDefinition` | The parts of an orchestration. |
| `DomainServiceDefinition` | A stateless domain service that consumes and produces a named event or value object. |
| `ProjectionDefinition` | A read model built from source events, with its fields and gateways. |
| `QueryDefinition` | A query over projections or value objects, with its inputs. |
| `RuleDefinition` | A context-level rule and its enforcer (`declared` service or query, or `external`). |
| `GatewayDefinition` | A gateway on a projection, policy, orchestration, or external. |
| `ExternalDefinition` | An external system that is not modelled but may be a relationship end or a lane. |
| `ContextRelationship` | A relationship between two contexts or externals, with its type and contract. |
| `AnnotationDefinition` | A `@classification`, `@retention`, or `@encryption` annotation. |
| `PreconditionDefinition` | A precondition that must be satisfied before a command executes; `causes` limits it to some causes. |
| `FlowDefinition` | A flow with its lanes, moments, and connections. |
| `LaneDefinition` | A flow lane bound to a context or external. |
| `MomentDefinition` | A moment within a flow, with its entries, branches and `notes`. |
| `MomentEntry` | A node placed in a moment; its `nodeKind` is command, event, policy, saga, projection, or query, and `cause` names the cause a command is placed for. |
| `MomentSequenceItem` | The source order of a moment's entries and branches. |
| `BranchDefinition` | A `when` branch within a moment. |
| `ConnectionDefinition` | A connection between flow nodes or moments. |
| `ConnectionType` | `crosses-to`, `triggered-by`, `triggers`, or `returns-to`. |
| `GlossaryEntry` | A glossary term with its definition and context. |
| `SchemaContract` | The field contract of a context crossing. |
| `SchemaFieldDefinition` | A field within a schema contract. |

### Parse Result Types

| Type | Description |
|------|-------------|
| `ParseResult` | Result of parsing: `success`, the IR when there are no errors, and diagnostics. |
| `ValidationResult` | Result of a validation pass: `valid` and diagnostics. |
| `Diagnostic` | A diagnostic with severity, message, optional rule id, and optional source location. |
| `SourceLocation` | File path, line, and column (1-based) for a diagnostic. |

### Import

| Export | Description |
|--------|-------------|
| `SiftSpecificationImporter` | `import(input)` maps Sift building blocks and timeline events to context and flow file entries plus an upstream fingerprint; `generateContextFile(block)` and `generateFlowFile(event)` return `.moment` source. It does no file I/O; reading a `.domain/` directory is done by `SiftEventStreamReader` from `@mmmnt/sync`. |

### Import Types

| Type | Description |
|------|-------------|
| `SiftBuildingBlock` | A Sift building block describing one bounded context. |
| `SiftTimelineEvent` | A Sift timeline event describing one flow. |
| `SiftImportInput` | Input to the Sift importer: source product and version, building blocks, and timeline events. |
| `ImportResult` | Result of a Sift import: context and flow file references, manifest entries, fingerprint, and diagnostics. |
| `UpstreamFingerprint` | Source, version, content hash, and import time of the upstream specification. |

### Manifest

| Export | Description |
|--------|-------------|
| `ManifestScaffolder` | `scaffold(targetDir, options)` writes `.manifest.yaml` and creates `.moment/contexts/` and `.moment/flows/`. Accepts `ScaffoldOptions`; refuses to overwrite an existing manifest. |
| `ManifestReader` | `readManifest(path)` reads and parses a `.manifest.yaml`. Returns `ManifestConfiguration`. |
| `ManifestUpdater` | Updates the manifest's context and flow lists from a project directory or a parsed file. Returns `ManifestUpdateResult`. |

### Manifest Types

| Type | Description |
|------|-------------|
| `ScaffoldOptions` | Project name and optional version and description. |
| `ScaffoldResult` | The manifest path and the directories created. |
| `ManifestUpdateResult` | Whether the manifest changed, and how many contexts and flows were added. |
| `ManifestConfiguration` | Parsed manifest: name, version, context and flow file references, generator configs, and watch configuration. |
| `WatchConfiguration` | Whether watching is enabled, the debounce interval, and the watched paths. |
| `FileRef` | A named file reference within the manifest. |
| `GeneratorConfig` | An output format (`typescript`, `gherkin`, or `markdown`) and its output directory. |

### Generators

| Export | Description |
|--------|-------------|
| `GeneratorRegistry` | Registry of generator descriptors by format, with dependency-ordered execution planning. |
| `GeneratorDescriptor`, `GeneratorRunContext`, `GeneratorRunResult`, `GeneratorScope` | The contract a generator package implements. |

### Services

| Export | Description |
|--------|-------------|
| `SchemaValidator` | `validate(ir)` runs structural IR checks (SP-01 to SP-04); `validateManifestFiles(files, fileExists)` checks manifest file references (SP-05). |

### Infrastructure

| Export | Description |
|--------|-------------|
| `FileWatcher` | Watches the configured paths for `.moment` and YAML changes and calls back after a debounce. Built on chokidar for cross-platform file system events. Accepts `FileWatcherOptions`. |
| `RegenerateOnMomentFileChanged` | Policy that re-parses a changed file. `onFileChanged(path)` resolves to a `RegenerateResult`. |

## Examples

### Parsing and Inspecting a Specification

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';

const path = 'specs/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);

// Check for diagnostics
for (const d of result.diagnostics) {
  const at = d.source ? `${d.source.file}:${d.source.line}:${d.source.column}` : path;
  console.log(`[${d.severity}] ${at} ${d.message}`);
}

// Inspect the IR
if (result.ir) {
  for (const ctx of result.ir.contexts) {
    console.log(`Context: ${ctx.name}`);
    for (const agg of ctx.aggregates) {
      console.log(`  Aggregate: ${agg.name}`);
      console.log(`    Commands: ${agg.commands.map((c) => c.name).join(', ')}`);
      console.log(`    Events: ${agg.events.map((e) => e.name).join(', ')}`);
      console.log(`    Invariants: ${agg.invariants.map((i) => i.id).join(', ')}`);
    }
  }

  for (const flow of result.ir.flows) {
    console.log(`Flow: ${flow.name} (${flow.moments.length} moments)`);
  }
}
```

### Loading a Model Directory as One Project

```typescript
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectLoader } from '@mmmnt/core';

const dir = 'model';
const files = readdirSync(dir, { recursive: true })
  .filter((f) => f.endsWith('.moment'))
  .map((f) => join(dir, f));

const project = await new ProjectLoader().loadProject(files);

console.log(`${project.filesParsed} file(s) parsed, ${project.filesErrored} with errors`);
for (const d of project.diagnostics) {
  console.log(`[${d.severity}] ${d.ruleId ?? ''} ${d.message}`);
}
if (project.success) {
  console.log(`Contexts: ${project.ir.contexts.length}`);
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

### Scaffolding a New Project

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

### Watch Mode for Development

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
      console.log(`Re-parsed: ${parseResult.ir.contexts.length} contexts, ${parseResult.ir.flows.length} flows`);
    } else {
      console.log(`Parse errors: ${parseResult.diagnostics.length}`);
    }
  },
});

watcher.start();
// later: watcher.stop();
```

## Integration

`@mmmnt/core` is the foundation of the Moment package ecosystem. It has no dependencies on other `@mmmnt` packages. All other packages in the toolchain depend on it:

```
@mmmnt/core
  |
  +-- @mmmnt/derive      (consumes IR for test topologies, simulations, catalogs)
  +-- @mmmnt/emit-ts     (consumes IR for TypeScript type generation)
  +-- @mmmnt/generate    (consumes IR for Gherkin, spec docs, AsyncAPI)
  +-- @mmmnt/viz         (consumes IR for context maps, timelines)
  +-- @mmmnt/schema      (consumes IR for schema lifecycle governance)
  +-- @mmmnt/harness     (consumes IR via derive for test execution)
  +-- @mmmnt/sync        (consumes IR via emit-ts for drift detection)
  +-- @mmmnt/cli         (orchestrates all packages via CLI commands)
  +-- @mmmnt/mcp         (exposes core workflows via MCP protocol)
```

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

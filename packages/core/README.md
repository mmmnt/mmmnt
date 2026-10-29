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

// Errors make success false; warnings (including V22–V39 advisories) leave it true
for (const d of result.diagnostics) {
  console.log(`[${d.severity}] ${d.ruleId ?? ''} ${d.message}`);
}
```

## Key Features

- **Langium-based parser** -- full grammar definition with error recovery and precise diagnostic messages pointing to the exact line and column of issues.
- **Typed Intermediate Representation** -- a normalized, strongly-typed IR that downstream packages consume without needing to understand the raw AST.
- **Project mode** -- `ProjectLoader` parses many `.moment` files and merges them into one IR, resolving names across files and checking cross-file references.
- **Model completeness, palette and reference rules** -- V22–V39 check that projections, queries, rules, services, relationships, lanes, policies, orchestrations, aggregate states, gateways, emitted events and `triggers` targets name things the model declares (see [Validation Rules](#validation-rules)).
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
| Policy | context | `policy <Name> trigger <Event> action "<text>" chains-to <Command>` -- one domain event, one command. |
| Orchestration | context | `orchestration <Name>` (`saga` is an alias) with its own `command`s, `invoked-by`, `issues`, `states`, `compensation` and `timeout`. |
| Aggregate states | aggregate | `state initial <Name>` and `state <From> -> <To> on <Command>`, written right after the identity. |
| Gateway | projection, policy, orchestration, external | `gateway <Name> consumes <Event or ValueObject> produces <Event or ValueObject>`, with optional `description`. |

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

The grammar source is [`src/grammar/moment.langium`](src/grammar/moment.langium).

## Validation Rules

V22–V39 compare names across declarations, so their severity depends on how much of the model the parser can see. `MomentParser.parseContent` reports them as **warnings** for a single file that declares contexts; `ProjectLoader.loadProject` reports them as **errors** over the merged project, where a missing name is genuinely missing. Each diagnostic carries its id in `ruleId`.

| Rule | Checks |
|------|--------|
| V22 | Every projection source is a declared event. |
| V23 | Every name a query reads is a declared projection or value object. |
| V24 | A rule with a declared enforcer is enforced by a service or query of its context. |
| V25 | A value object is declared at most once per context. |
| V26 | A glossary term is defined at most once per context. |
| V27 | Every relationship end is a declared context or external, and every `[External]` lane names a declared external. |
| V28 | Every service `consumes` and `produces` a declared event or value object. |
| V29 | Every policy chains to a command of an aggregate or an orchestration. |
| V30 | Every policy is triggered by a declared domain event. |
| V31 | An orchestration's commands emit no domain event. |
| V32 | An orchestration is invoked by one of its own commands. |
| V33 | Every command an orchestration issues is an aggregate command or an operation of a declared external. |
| V34 | Every orchestration step advances on one of its own commands, and some policy chains to that command. |
| V35 | `compensation none` stands alone; every other compensation is on one of the orchestration's own commands and issues resolvable commands. |
| V36 | An aggregate with states has exactly one initial state, transitions only on its own commands, and every state is reachable from the initial one. |
| V37 | Every gateway `consumes` and `produces` a declared event or value object. |
| V38 | Every aggregate command `emits` an event declared somewhere in the model. |
| V39 | Every `triggers` target is a node placed in the same flow (`triggered-by` targets are checked by V5). |

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
| `ProjectLoader` | `loadProject(filePaths, metadataOverride?)` parses each file, merges the IRs, runs cross-file validation and V22–V39, and resolves to a `ProjectLoadResult` (`success`, `ir`, `diagnostics`, `filesParsed`, `filesErrored`). |
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
| `CommandDefinition` | A command with its input fields, preconditions, and the event it emits. |
| `EventDefinition` | A domain event with its payload fields. |
| `ValueObjectDefinition` | A value object with its fields. |
| `FieldDefinition` | A typed field within a command, event, value object, projection, or query. |
| `InvariantDefinition` | A business invariant that must hold for an aggregate. |
| `PolicyDefinition` | A reactive policy: one triggering domain event and the command it chains to. |
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
| `PreconditionDefinition` | A precondition that must be satisfied before a command executes. |
| `FlowDefinition` | A flow with its lanes, moments, and connections. |
| `LaneDefinition` | A flow lane bound to a context or external. |
| `MomentDefinition` | A moment within a flow, with its entries and branches. |
| `MomentEntry` | A node placed in a moment; its `nodeKind` is command, event, policy, saga, projection, or query. |
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

const path = 'specs/vet-clinic.moment';
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

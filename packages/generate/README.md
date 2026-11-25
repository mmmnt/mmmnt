# @mmmnt/generate

Gherkin BDD scenarios, specification documents, and AsyncAPI contracts from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/generate.svg)](https://www.npmjs.com/package/@mmmnt/generate)

## Overview

`@mmmnt/generate` writes documents from a Moment model that people and tools read:

| Generator                        | Output                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `GherkinGenerator`               | one `.feature` file per flow, for Cucumber, SpecFlow or any BDD runner               |
| `SpecificationDocumentGenerator` | `specification.md`: a narrative of each flow, Mermaid diagrams, and the domain model |
| `generateAsyncApiSpec`           | an AsyncAPI 3.0 YAML document for the events that cross a context boundary           |
| `generateCucumberJson`           | Cucumber JSON for the generated features, for tools that import Cucumber results     |

Each one is derived from the model, so it changes when the model changes. The same model always generates the same output.

For the history of changes, see [CHANGELOG.md](CHANGELOG.md).

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/generate
```

Or with other package managers:

```bash
pnpm add @mmmnt/generate
yarn add @mmmnt/generate
```

## Quick Start

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator } from '@mmmnt/generate';

const path = 'examples/ticketwave/spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;
const topology = deriveTopology(ir);

const manifest = new GherkinGenerator().generate(ir, topology);

for (const feature of manifest.featuresGenerated) {
  console.log(feature.filePath);
  // Write feature.content to disk as a .feature file
}
```

Output for TicketWave:

```
features/n1-general-admission-purchase.feature
features/n2-presale-access.feature
features/n3-ticket-transfer.feature
features/n4-event-cancellation.feature
features/n5-seat-request.feature
features/n6-payment-settlement.feature
features/n7-hold-release.feature
features/n8-waitlist-offer.feature
```

The file name is the flow name in lower case, with every run of other characters replaced by `-`.

## Gherkin Features

A feature has one `Rule` per context the flow crosses. Under each rule, a `Background` holds the preconditions that every scenario of the rule shares, then come the scenarios:

- one scenario per moment, and one per arm of a branch moment (`<moment> [<arm>]`)
- for each saga the flow owns, `<Saga> state transitions`, and `<Saga> compensation` (or one `<Saga> compensation on <Command>` per named compensation of an orchestration)
- no scenario for a moment that holds only notes. It renders as a `# moment:` comment followed by its notes

A precondition is a `Given`, a command a `When` (`<Context> performs <Command> with <inputs>`), and an event a `Then` (`<Context> emits <Event>`, with the fields it is `carrying`). A query step reads `answers query` and a projection step `serves projection`. A `triggered-by` source becomes `<Event> has occurred`, as a `Given` or an `And`. A crossing renders its contract as a data table. A note renders as a comment line, `# note (<lane>): <text>`, and asserts nothing.

When a command records several events (`emits A, B`), the first is `Then` and each later one `And`, right after the command's `When`. Only the events the flow places are rendered.

An arm that ends the flow renders the exit: `(terminal)` and `Then the flow terminates at <Event>` for `[terminal]`, `(outcome)` and `Then the flow ends at <Event>` for `[outcome]`. A `returns-to` arm ends with `Then the flow returns to "<moment>"`.

### Tags

| Tag                                          | Where                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@context:<Name>`, `@classification:<Class>` | the feature, once per context the flow crosses                                                                                                                 |
| `@aggregate:<Name>`                          | a scenario that places a command or event of the aggregate                                                                                                     |
| `@policy:<Name>`                             | a scenario that places the command a policy chains to                                                                                                          |
| `@saga:<Name>`                               | a scenario that places the saga's start event, and the saga's own scenarios                                                                                    |
| `@compensation`                              | a saga compensation scenario                                                                                                                                   |
| `@invariant:<id>`                            | a scenario that places a node of the aggregate the invariant is scoped to                                                                                      |
| `@crossing`                                  | a scenario with an event that crosses to another context                                                                                                       |
| `@alt-path`                                  | an arm of a branch moment that neither returns nor ends at `[terminal]`, including one that ends at `[outcome]`. Moment does not infer a happy path in Gherkin |
| `@retry-path`                                | an arm that `returns-to` an earlier moment                                                                                                                     |
| `@terminal`                                  | an arm that ends the flow                                                                                                                                      |
| `@failure-path`                              | an arm that ends at `[terminal]`                                                                                                                               |

An excerpt of `features/n5-seat-request.feature`:

```gherkin
@context:Inventory @classification:Core @context:Checkout @classification:Core @context:Presale @classification:Supporting
Feature: N5 - Seat request
  A customer asks for seats. With seats in the pool the customer gets a hold; with the tier sold out the customer joins the waitlist.

  Rule: Inventory [Core]

    Background:
      Given Requested quantity must be available in the pool
      Given Customer must not exceed maximum concurrent holds

    @aggregate:SeatHold @saga:SeatHoldLifecycle @invariant:INV-02 @invariant:INV-03 @invariant:INV-04
    Scenario: Seat request
      When Inventory performs RequestHold with eventId, tierId, sectionId, quantity, customerId, sessionId
      Then Inventory emits SeatsHeld
        carrying holdId, eventId, tierId, sectionId, quantity, customerId, sessionId, expiresAt, heldAt

  Rule: Checkout [Core]

    @terminal @alt-path
    Scenario: Availability decision [sold-out]
      Given the availability decision is evaluated
      When the outcome is sold-out
      Given Customer must not already be on the waitlist for this tier
      When Presale performs JoinWaitlist with eventId, tierId, customerId, requestedQuantity
      Then Presale emits WaitlistJoined (outcome)
        carrying waitlistId, eventId, tierId, customerId, requestedQuantity, position, joinedAt
      Then the flow ends at WaitlistJoined
```

A policy's condition (`when reason = expired`, `after SeatsHeld`) is not rendered in Gherkin. The derived scenarios of `@mmmnt/derive` carry it in their payloads.

## Specification Document

`SpecificationDocumentGenerator.generate(ir)` returns one document, `specification.md` (`documentType: 'specification'`), with these sections:

- **At a Glance**: a table of contexts with their classification, description and counts, a Mermaid context map, and a Mermaid sequence diagram per flow
- **What Happens**: a step-by-step narrative of each flow, with branches, notes as narrated steps, the policies a step triggers, and the rules that apply
- **Context Boundaries**: each crossing and the fields its contract requires
- **Domain Model**: per context, aggregates with identity, commands and event shapes; sagas; projections (with the events they fold), queries (with the projections they read), rules (with their enforcer) and glossary terms; then the external systems the model declares
- **Data Glossary**: every value object and its fields

A command with several events is written the way it is declared: `produces **A**, **B**` for events recorded together, `produces **A** or **B**` for alternatives, and with guards `produces **A** when Open, or **A**, **B** when OneUseLeft`. The command table and the sequence diagram join the events the same way. From TicketWave:

```
- Presale performs **RedeemAccessCode** → produces **AccessCodeRedeemed** when Open, or **AccessCodeRedeemed**, **AccessCodeExhausted** when OneUseLeft
```

The generator returns an empty array when the IR has no contexts and no flows.

## AsyncAPI

`generateAsyncApiSpec(ir)` returns an AsyncAPI 3.0 YAML string:

- the title from the specification metadata, and version `1.0.0`
- one channel and one message per event that crosses a context boundary, with the producing and consuming contexts in the channel description
- a payload schema from the event's fields. A field typed `number` or `boolean` keeps its type; every other type is written as `string`. A deprecated field is marked `deprecated: true`
- a `required` list from the crossing contract's `[required]` fields, or from the event's required fields when the contract marks none

A field name that YAML would read as a boolean or null (`on`, `off`, `yes`, `no`, `y`, `n`, `true`, `false`, `null`) is single-quoted.

For a closed JSON Schema of every event payload, with code sets, unions, maps and patterns, use `moment schema emit` from `@mmmnt/schema`.

## Cucumber JSON

`generateCucumberJson(manifest, topology, ir)` parses the generated features into Cucumber JSON (`CucumberFeature[]`). Nothing runs at generation time, so a scenario backed by a derived test case is reported as `pending` and every other one as `skipped`.

## API Reference

### Generators

| Export                                         | Description                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GherkinGenerator`                             | `generate(ir, topology)` renders one feature per flow and returns a `GenerationManifest` with `docsGenerated` empty. The topology argument is accepted and not read. |
| `renderFeatureFromIr(flow, ir)`                | Renders the `.feature` content of one flow, without a topology.                                                                                                      |
| `SpecificationDocumentGenerator`               | `generate(ir)` returns `GeneratedDocument[]`: the specification document, or nothing for an empty IR.                                                                |
| `generateAsyncApiSpec(ir)`                     | Returns the AsyncAPI 3.0 YAML string.                                                                                                                                |
| `generateCucumberJson(manifest, topology, ir)` | Returns `CucumberFeature[]` for the features in the manifest.                                                                                                        |

### Policies

| Export                             | Description                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GenerateGherkinOnTopologyDerived` | `execute(ir, topology)` runs the Gherkin and specification document generators and returns one `GenerationManifest` with both. `handle(topology, ir)` has the `TopologyDerivedHook` signature of `@mmmnt/derive` and discards the result. |

### Key Types

| Type                   | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `GeneratedFeatureFile` | `flowId`, `filePath`, `content`, `scenarioCount` (one per moment and per branch arm).       |
| `GeneratedDocument`    | `documentType`, `filePath`, `content`.                                                      |
| `GenerationManifest`   | `featuresGenerated` and `docsGenerated` of one run.                                         |
| `CucumberFeature`      | A Cucumber JSON feature: `keyword`, `name`, `description`, `id`, `uri`, `tags`, `elements`. |
| `CucumberScenario`     | A scenario of a feature: `keyword`, `name`, `id`, `type`, `tags`, `steps`.                  |
| `CucumberStep`         | A step: `keyword`, `name`, `line`, `result` (`status`, `duration`).                         |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start.

### Writing the Feature Files

```typescript
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator } from '@mmmnt/generate';

const { featuresGenerated } = new GherkinGenerator().generate(ir, deriveTopology(ir));

for (const feature of featuresGenerated) {
  mkdirSync(dirname(feature.filePath), { recursive: true });
  writeFileSync(feature.filePath, feature.content);
}
console.log(`Wrote ${featuresGenerated.length} feature files`);
// Wrote 8 feature files
```

### Building the Specification Document

```typescript
import { writeFileSync } from 'node:fs';
import { SpecificationDocumentGenerator } from '@mmmnt/generate';

const [document] = new SpecificationDocumentGenerator().generate(ir);

if (document) {
  writeFileSync(document.filePath, document.content);
  console.log(`Wrote ${document.filePath}`);
}
// Wrote specification.md
```

### Generating an AsyncAPI Document

```typescript
import { writeFileSync } from 'node:fs';
import { generateAsyncApiSpec } from '@mmmnt/generate';

const yaml = generateAsyncApiSpec(ir);
writeFileSync('asyncapi.yaml', yaml);
```

The start of the TicketWave document:

```yaml
asyncapi: '3.0.0'
info:
  title: 'ticketwave'
  version: '1.0.0'
  description: ''

channels:
  event-published:
    address: 'event-published'
    messages:
      EventPublished:
        $ref: '#/components/messages/EventPublished'
```

### Cucumber JSON

```typescript
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator, generateCucumberJson } from '@mmmnt/generate';

const topology = deriveTopology(ir);
const manifest = new GherkinGenerator().generate(ir, topology);
const features = generateCucumberJson(manifest, topology, ir);

const feature = features.find((f) => f.name === 'N5 - Seat request');
for (const scenario of feature.elements) {
  console.log(scenario.name, scenario.steps.map((s) => s.result.status).join(','));
}
```

Output:

```
Seat request pending,pending
Availability decision [seats-available] pending,pending,pending
Availability decision [sold-out] pending,pending,pending,pending,pending,pending
```

## Integration

`@mmmnt/generate` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for the test topology:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/generate
                                       |
                                       +-- @mmmnt/cli       (`moment generate`, `moment cucumber-json`, `moment simulate --out-dir`)
```

`moment generate <file|dir> --out <dir>` writes, in one pass, the feature files, `specification.md`, and the TypeScript types and test scaffolds of `@mmmnt/emit-ts`. For TicketWave: 8 `.feature` files, 21 `.spec.ts` files and 1 document. `moment cucumber-json <file|dir>` prints the Cucumber JSON. `moment simulate --all --out-dir <dir>` writes `asyncapi.yaml` with the files Facet loads. Every command accepts a single file or a model directory, which it loads as one project.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/generate
pnpm --filter @mmmnt/generate test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

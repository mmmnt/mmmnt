# @mmmnt/generate

Gherkin BDD scenarios, specification documents, and AsyncAPI contracts from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/generate.svg)](https://www.npmjs.com/package/@mmmnt/generate)

## Overview

`@mmmnt/generate` produces human-readable and machine-readable documentation artifacts from your `.moment` specification files. It bridges the gap between your domain specification and the formats that testing frameworks, documentation tools, and API consumers expect.

The Gherkin generator renders each flow in the IR as a `.feature` file for Cucumber, SpecFlow, or any BDD runner, with Given/When/Then steps that reflect the domain flow. The specification document generator produces a `specification.md` with Mermaid diagrams of the context map and flow sequences, a narrative of each flow, and the domain model, including projections, queries, rules, terms, and external systems. The AsyncAPI generator outputs an AsyncAPI 3.0 YAML document describing the events that cross context boundaries.

Together, these generators ensure your living documentation stays synchronized with your domain specification, eliminating the drift between what the spec says and what the docs describe. This is especially valuable for teams where non-technical stakeholders need to review domain behavior -- the Gherkin scenarios serve as executable specifications written in natural language, and the specification document provides a visual overview without requiring access to the raw `.moment` files.

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

const path = 'path/to/spec.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;
const topology = deriveTopology(ir);

const generator = new GherkinGenerator();
const manifest = generator.generate(ir, topology);

for (const feature of manifest.featuresGenerated) {
  console.log(`Feature: ${feature.filePath} (${feature.scenarioCount} scenarios)`);
  // Write feature.content to disk as a .feature file
}
```

## Key Features

- **Gherkin BDD scenario generation** -- produces one `.feature` file per flow, with Given/When/Then steps that map directly to your domain flows.
- **Specification document rendering** -- generates a Markdown document with embedded Mermaid diagrams, a narrative of each flow, context boundaries, and the domain model.
- **Read side and model completeness** -- the specification document lists each context's projections (with the events they fold), queries (with the projections they read), rules (with their enforcer), and glossary terms, plus the external systems the model declares.
- **AsyncAPI specification generation** -- outputs AsyncAPI 3.0 YAML with a channel and message per context crossing, and payload schemas derived from the specification.
- **Tagged scenarios** -- Gherkin features and scenarios are tagged with context, classification, aggregate, policy, saga, and invariant metadata, enabling selective execution with standard BDD runners.
- **Cucumber JSON** -- `generateCucumberJson` converts generated features into standard Cucumber JSON.
- **Policy-driven automation** -- the `GenerateGherkinOnTopologyDerived` policy generates features and the specification document for a derived topology.
- **Lower-level rendering** -- `renderFeatureFromIr` renders the feature for a single flow when the full generator is not needed.
- **Deterministic output** -- the same specification always produces identical generated artifacts.

## Generated Output

### Gherkin Features

- One `features/<flow>.feature` file per flow
- `Given` steps for preconditions and setup state
- `When` steps for commands and triggers
- `Then` steps for expected events and state assertions
- Tagged with `@context`, `@classification`, `@aggregate`, `@policy`, `@saga`, and `@invariant` metadata, and path tags such as `@crossing`, `@alt-path`, and `@failure-path`, for selective execution

### Specification Document

`SpecificationDocumentGenerator` returns a single `specification.md` with:

- **At a Glance** -- a table of contexts with their classification, description, and counts, followed by a Mermaid **context map** and a Mermaid **sequence diagram** per flow
- **What Happens** -- a step-by-step narrative of each flow, with branches, the policies a step triggers, and the business rules that apply
- **Context Boundaries** -- the points where data crosses between contexts and the fields each crossing requires
- **Domain Model** -- per context: aggregates with identity, commands, and event shapes; sagas; **projections**, **queries**, and **rules**; and glossary **terms**; followed by the **external systems** the model declares
- **Data Glossary** -- every value object and its fields

### Cucumber JSON

- Cucumber JSON output is available via `generateCucumberJson` for tools that import Cucumber results. Nothing is executed at generation time, so steps backed by a derived test case are reported as `pending` and all other steps as `skipped`.

### AsyncAPI Specification

- AsyncAPI 3.0 YAML
- A channel and a message for each event that crosses a context boundary, with payload schemas derived from the specification and `required` fields taken from the crossing contract
- Title and version taken from the specification metadata

## API Reference

### Generators

| Export | Description |
|--------|-------------|
| `GherkinGenerator` | `generate(ir, topology)` renders one feature file per flow in the IR. Returns a `GenerationManifest`. |
| `renderFeatureFromIr(flow, ir)` | Lower-level function that renders the `.feature` content for a single flow, without requiring a topology. |
| `SpecificationDocumentGenerator` | `generate(ir)` produces the Markdown specification document described above. Returns `GeneratedDocument[]` (empty when the IR has no contexts and no flows). |
| `generateAsyncApiSpec(ir)` | Generates an AsyncAPI 3.0 YAML string from the IR, with a channel and message per context crossing. |
| `generateCucumberJson(manifest, topology, ir)` | Converts the generated features and test topology into Cucumber JSON (`CucumberFeature[]`). |

### Policies

| Export | Description |
|--------|-------------|
| `GenerateGherkinOnTopologyDerived` | Policy whose `execute(ir, topology)` runs the Gherkin and specification document generators and returns a `GenerationManifest`. Its `handle(topology, ir)` matches the `TopologyDerivedHook` signature. |

### Key Types

| Type | Description |
|------|-------------|
| `GeneratedFeatureFile` | A generated `.feature` file with its flow id, file path, content, and scenario count. |
| `GeneratedDocument` | A generated document with its document type, file path, and content. |
| `GenerationManifest` | The features and documents generated by a single run. |
| `CucumberFeature` | Represents a single Cucumber JSON feature object with scenarios and metadata. |
| `CucumberScenario` | Represents a scenario within a Cucumber JSON feature, including steps and tags. |
| `CucumberStep` | Represents an individual Given/When/Then step within a Cucumber JSON scenario. |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start:

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';

const path = 'specs/ticketing.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;
```

### Generating Gherkin Scenarios

```typescript
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator } from '@mmmnt/generate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const topology = deriveTopology(ir);

const generator = new GherkinGenerator();
const { featuresGenerated } = generator.generate(ir, topology);

for (const feature of featuresGenerated) {
  mkdirSync(dirname(feature.filePath), { recursive: true });
  writeFileSync(feature.filePath, feature.content);
  console.log(`Wrote: ${feature.filePath}`);
}
```

### Building a Specification Document

```typescript
import { SpecificationDocumentGenerator } from '@mmmnt/generate';
import { writeFileSync } from 'node:fs';

const docGenerator = new SpecificationDocumentGenerator();
const [document] = docGenerator.generate(ir);

if (document) {
  writeFileSync(document.filePath, document.content);
  console.log(`Generated ${document.filePath}: ${document.content.length} characters`);
}
```

### Generating an AsyncAPI Specification

```typescript
import { generateAsyncApiSpec } from '@mmmnt/generate';
import { writeFileSync } from 'node:fs';

const asyncApiYaml = generateAsyncApiSpec(ir);
writeFileSync('asyncapi.yaml', asyncApiYaml);
```

## Integration

`@mmmnt/generate` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It integrates with the broader ecosystem:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/generate
                                       |
                                       +-- @mmmnt/cli       (exposed via `moment generate` and `moment cucumber-json`)
```

`moment generate` writes the feature files, the specification document, and the TypeScript output of `@mmmnt/emit-ts` in one pass (`--out <dir>`). Both commands accept a single file or a model directory, which they load as one project.

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

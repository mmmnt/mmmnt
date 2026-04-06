# @mmmnt/generate

Gherkin BDD scenarios, specification documents, and AsyncAPI contracts from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/generate.svg)](https://www.npmjs.com/package/@mmmnt/generate)

## Overview

`@mmmnt/generate` produces human-readable and machine-readable documentation artifacts from your `.moment` specification files. It bridges the gap between your domain specification and the formats that testing frameworks, documentation tools, and API consumers expect.

The Gherkin generator transforms derived test topologies into `.feature` files that can be executed by Cucumber, SpecFlow, or any BDD runner. Each scenario maps to a derived test case, with Given/When/Then steps that reflect the domain flow. The specification document generator produces a comprehensive `specification.md` with Mermaid diagrams showing context maps, flow sequences, and event relationships. The AsyncAPI generator outputs a standards-compliant `asyncapi.yaml` describing your event-driven API.

Together, these generators ensure your living documentation stays synchronized with your domain specification, eliminating the drift between what the spec says and what the docs describe. This is especially valuable for teams where non-technical stakeholders need to review domain behavior -- the Gherkin scenarios serve as executable specifications written in natural language, and the specification document provides a visual overview without requiring access to the raw `.moment` files.

## Installation

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
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator } from '@mmmnt/generate';

const parser = new MomentParser();
const { ast } = parser.parse('path/to/spec.moment');
const ir = astToIr(ast);
const topology = deriveTopology(ir);

const generator = new GherkinGenerator();
const features = generator.generate(ir, topology);

for (const feature of features) {
  console.log(`Feature: ${feature.path}`);
  // Write feature.content to disk as a .feature file
}
```

## Key Features

- **Gherkin BDD scenario generation** -- produces `.feature` files from derived test topologies with Given/When/Then steps that map directly to your domain flows.
- **Specification document rendering** -- generates a comprehensive Markdown document with embedded Mermaid diagrams showing context maps, flow sequences, and event relationships.
- **AsyncAPI specification generation** -- outputs standards-compliant AsyncAPI 3.0 YAML describing channels, messages, and payload schemas for your event-driven architecture.
- **Tagged scenarios** -- each Gherkin scenario is tagged with context and flow metadata, enabling selective execution with standard BDD runners.
- **Mermaid diagram embedding** -- specification documents include context map diagrams, sequence diagrams for flows, and event catalog tables.
- **Policy-driven automation** -- the `GenerateGherkinOnTopologyDerived` policy triggers generation automatically when a topology is derived.
- **Lower-level rendering** -- `renderFeatureFromIr` provides fine-grained control for rendering individual features when the full generator is not needed.
- **Deterministic output** -- the same specification always produces identical generated artifacts.

## Generated Output

### Gherkin Features

- One `.feature` file per flow or test suite
- `Given` steps for preconditions and setup state
- `When` steps for commands and triggers
- `Then` steps for expected events and state assertions
- Tagged with `@context`, `@flow`, and `@aggregate` metadata for selective execution

### Specification Document

- **Context map** rendered as a Mermaid diagram showing bounded contexts and their relationships
- **Per-context sections** listing aggregates, commands, events, and invariants
- **Flow diagrams** as Mermaid sequence diagrams showing step-by-step cross-context interactions
- **Event catalog** table with producers, consumers, and payload summaries
- **Glossary** of domain terms extracted from the specification

### Cucumber JSON

- Cucumber JSON output is available via `generateCucumberJson` for CI/QMS integration, enabling direct import into tools like Xray for test management and traceability reporting.

### AsyncAPI Specification

- Standards-compliant AsyncAPI 3.0 YAML
- Channels for each event with payload schemas derived from the specification
- Server bindings and protocol metadata
- Compatible with AsyncAPI Studio, code generators, and documentation tools

## API Reference

### Generators

| Export | Description |
|--------|-------------|
| `GherkinGenerator` | Generates `.feature` files from the IR and derived topology. Produces one feature file per flow or test suite. |
| `renderFeatureFromIr(ir)` | Lower-level function that renders a single feature from IR data without requiring a topology. |
| `SpecificationDocumentGenerator` | Produces a Markdown specification document with embedded Mermaid diagrams covering context maps, flows, and event catalogs. |
| `generateAsyncApiSpec(ir)` | Generates an AsyncAPI 3.0 YAML specification from the IR with channels, messages, and payload schemas. |
| `generateCucumberJson(manifest, topology, ir)` | Converts Gherkin features and test topology into Cucumber JSON format for Xray import and CI/QMS integration. |

### Policies

| Export | Description |
|--------|-------------|
| `GenerateGherkinOnTopologyDerived` | Policy that triggers Gherkin generation when a topology is derived, enabling automated watch-mode workflows. |

### Key Types

| Type | Description |
|------|-------------|
| `GeneratedFeatureFile` | A generated `.feature` file with path and content. |
| `GeneratedDocument` | A generated document with path, content, and format metadata. |
| `GenerationManifest` | Summary of all generated artifacts from a single run, with file counts and paths. |
| `CucumberFeature` | Represents a single Cucumber JSON feature object with scenarios and metadata. |
| `CucumberScenario` | Represents a scenario within a Cucumber JSON feature, including steps and tags. |
| `CucumberStep` | Represents an individual Given/When/Then step within a Cucumber JSON scenario. |

## Examples

### Generating Gherkin Scenarios

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { GherkinGenerator } from '@mmmnt/generate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);
const topology = deriveTopology(ir);

const generator = new GherkinGenerator();
const features = generator.generate(ir, topology);

for (const feature of features) {
  mkdirSync(dirname(feature.path), { recursive: true });
  writeFileSync(feature.path, feature.content);
  console.log(`Wrote: ${feature.path}`);
}

// Example output in a .feature file:
// @context:Scheduling @flow:ScheduleAppointment
// Feature: Schedule Appointment
//   Scenario: Successfully schedule an appointment
//     Given a registered patient "Jane"
//     When the receptionist schedules an appointment for "2026-04-10"
//     Then an AppointmentScheduled event is emitted
//     And the appointment appears in the schedule
```

### Building a Specification Document

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { SpecificationDocumentGenerator } from '@mmmnt/generate';
import { writeFileSync } from 'node:fs';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const docGenerator = new SpecificationDocumentGenerator();
const document = docGenerator.generate(ir);

writeFileSync('specification.md', document.content);
console.log(`Generated specification: ${document.content.length} characters`);
```

### Generating an AsyncAPI Specification

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { generateAsyncApiSpec } from '@mmmnt/generate';
import { writeFileSync } from 'node:fs';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const asyncApiYaml = generateAsyncApiSpec(ir);
writeFileSync('asyncapi.yaml', asyncApiYaml);

// The output is a valid AsyncAPI 3.0 YAML that can be used with:
//   - AsyncAPI Studio for interactive exploration
//   - AsyncAPI Generator for code generation in multiple languages
//   - AsyncAPI documentation tools for publishing API docs
```

## Integration

`@mmmnt/generate` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It integrates with the broader ecosystem:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/generate
                                       |
                                       +-- @mmmnt/harness   (executes generated Gherkin scenarios)
                                       +-- @mmmnt/viz       (complementary interactive visualizations)
                                       +-- @mmmnt/cli       (exposed via `moment generate`)
                                       +-- @mmmnt/mcp       (exposed via MCP tools)
```

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

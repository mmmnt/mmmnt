# @mmmnt/generate

Gherkin BDD scenario generation, specification document rendering, and AsyncAPI spec production from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/generate.svg)](https://www.npmjs.com/package/@mmmnt/generate)

## Overview

`@mmmnt/generate` produces human-readable and machine-readable documentation artifacts from your `.moment` specification files. It bridges the gap between your domain specification and the formats that testing frameworks, documentation tools, and API consumers expect.

The Gherkin generator transforms derived test topologies into `.feature` files that can be executed by Cucumber, SpecFlow, or any BDD runner. Each scenario maps to a derived test case, with Given/When/Then steps that reflect the domain flow. The specification document generator produces a comprehensive `specification.md` with Mermaid diagrams showing context maps, flow sequences, and event relationships. The AsyncAPI generator outputs a standards-compliant `asyncapi.yaml` describing your event-driven API.

Together, these generators ensure your living documentation stays synchronized with your domain specification, eliminating the drift between what the spec says and what the docs describe.

## Installation

```bash
npm install @mmmnt/generate
```

## Quick Start

### Gherkin BDD Scenarios

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

### Specification Document

```typescript
import { SpecificationDocumentGenerator } from '@mmmnt/generate';

const docGenerator = new SpecificationDocumentGenerator();
const document = docGenerator.generate(ir);

// document.content is a Markdown string with embedded Mermaid diagrams
console.log(`Generated specification: ${document.content.length} chars`);
```

### AsyncAPI Specification

```typescript
import { generateAsyncApiSpec } from '@mmmnt/generate';

const asyncApiYaml = generateAsyncApiSpec(ir);
// Write to asyncapi.yaml for use with AsyncAPI tools
```

## Generated Output

### Gherkin Features

- One `.feature` file per flow or test suite
- `Given` steps for preconditions and setup state
- `When` steps for commands and triggers
- `Then` steps for expected events and state assertions
- Tagged with context and flow metadata for selective execution

### Specification Document

- **Context map** rendered as a Mermaid diagram
- **Per-context sections** listing aggregates, commands, events, and invariants
- **Flow diagrams** as Mermaid sequence diagrams
- **Event catalog** table with producers, consumers, and payload summaries

### AsyncAPI Specification

- Standards-compliant AsyncAPI 3.0 YAML
- Channels for each event with payload schemas
- Server bindings and protocol metadata

## API Reference

| Export | Description |
|--------|-------------|
| `GherkinGenerator` | Generates `.feature` files from the IR and derived topology. |
| `renderFeatureFromIr(ir)` | Lower-level function that renders a single feature from IR data. |
| `SpecificationDocumentGenerator` | Produces a Markdown specification document with Mermaid diagrams. |
| `generateAsyncApiSpec(ir)` | Generates an AsyncAPI 3.0 YAML specification from the IR. |
| `GenerateGherkinOnTopologyDerived` | Policy that triggers Gherkin generation when a topology is derived. |

### Key Types

| Type | Description |
|------|-------------|
| `GeneratedFeatureFile` | A generated `.feature` file with path and content. |
| `GeneratedDocument` | A generated document with path, content, and format metadata. |
| `GenerationManifest` | Summary of all generated artifacts from a single run. |

## Integration

`@mmmnt/generate` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It integrates with the broader ecosystem:

- **@mmmnt/harness** can execute the generated Gherkin scenarios as part of a test run.
- **@mmmnt/viz** provides complementary interactive visualizations alongside the static Mermaid diagrams.
- **@mmmnt/cli** exposes generation via the `moment generate` command.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

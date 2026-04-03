# @mmmnt/core

Parser and intermediate representation engine for the Moment domain specification language.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/core.svg)](https://www.npmjs.com/package/@mmmnt/core)

## Overview

`@mmmnt/core` is the foundation package of the Moment toolchain. It provides a Langium-based parser for `.moment` specification files and transforms the resulting abstract syntax tree into a typed Intermediate Representation (IR) that all downstream packages consume.

The `.moment` DSL lets you describe bounded contexts, aggregates, commands, events, flows, and field-level schemas in a single declarative file. The core package parses these specifications, validates them against the grammar, and produces a structured IR that tools like code generators, test harnesses, and visualization engines can work with directly.

This package also includes the Sift specification importer, which reads JSONL event streams from upstream domain modeling tools and converts them into `.moment` files, and the manifest scaffolder for initializing new Moment projects.

## Installation

```bash
npm install @mmmnt/core
```

## Quick Start

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';

// Parse a .moment specification file
const parser = new MomentParser();
const parseResult = parser.parse('path/to/spec.moment');

if (parseResult.diagnostics.length === 0) {
  // Convert the AST to an Intermediate Representation
  const ir = astToIr(parseResult.ast);

  console.log(`Contexts: ${ir.contexts.length}`);
  console.log(`Flows: ${ir.flows.length}`);
}
```

### Importing from Sift

```typescript
import { SiftSpecificationImporter } from '@mmmnt/core';

const importer = new SiftSpecificationImporter();
const result = await importer.import({
  domainDir: '.domain/',
  outputDir: 'specs/',
});

console.log(`Imported ${result.contextsImported} bounded contexts`);
```

### Scaffolding a New Project

```typescript
import { ManifestScaffolder } from '@mmmnt/core';

const scaffolder = new ManifestScaffolder();
const result = await scaffolder.scaffold({
  projectName: 'my-service',
  outputDir: '.',
});
```

## API Reference

### Parser

| Export | Description |
|--------|-------------|
| `MomentParser` | Langium-based parser that reads `.moment` files and produces an AST with diagnostics. |
| `astToIr(ast)` | Transforms a parsed AST into a typed Intermediate Representation. |

### Intermediate Representation Types

| Type | Description |
|------|-------------|
| `ContextDefinition` | A bounded context with its aggregates, commands, events, and policies. |
| `FlowDefinition` | A cross-context flow describing step-by-step interactions between contexts. |
| `MomentDefinition` | A named moment (domain event) with its payload fields. |
| `FieldDefinition` | A typed field within a command, event, or value object payload. |

### Import

| Export | Description |
|--------|-------------|
| `SiftSpecificationImporter` | Reads Sift JSONL event streams from a `.domain/` directory and produces `.moment` specification files. |

### Manifest

| Export | Description |
|--------|-------------|
| `ManifestScaffolder` | Initializes a new Moment project with directory structure and manifest file. |
| `ManifestReader` | Reads and parses an existing `moment.manifest.json`. |
| `ManifestUpdater` | Updates manifest entries after code generation or sync operations. |

### Infrastructure

| Export | Description |
|--------|-------------|
| `FileWatcher` | Watches `.moment` files for changes and triggers rebuild callbacks. |
| `RegenerateOnMomentFileChanged` | Policy that orchestrates regeneration when spec files change. |

## Integration

`@mmmnt/core` is the foundation of the Moment package ecosystem. It has no dependencies on other `@mmmnt` packages. All other packages in the toolchain depend on it:

- **@mmmnt/derive** consumes the IR to derive test topologies, simulations, and event catalogs.
- **@mmmnt/emit-ts** consumes the IR to generate TypeScript interfaces and test scaffolds.
- **@mmmnt/generate** consumes the IR to produce Gherkin scenarios and specification documents.
- **@mmmnt/viz** consumes the IR to render context maps and flow timelines.
- **@mmmnt/schema** consumes the IR for schema governance and lifecycle management.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

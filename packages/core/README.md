# @mmmnt/core

Parser and intermediate representation for the Moment domain specification language.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/core.svg)](https://www.npmjs.com/package/@mmmnt/core)

## Overview

`@mmmnt/core` is the foundation package of the Moment toolchain. It provides a Langium-based parser for `.moment` specification files and transforms the resulting abstract syntax tree into a typed Intermediate Representation (IR) that all downstream packages consume.

The `.moment` DSL lets you describe bounded contexts, aggregates, commands, events, flows, and field-level schemas in a single declarative file. Rather than scattering domain knowledge across code comments, wiki pages, and tribal memory, you define the authoritative model in one place. The core package parses these specifications, validates them against the grammar, and produces a structured IR that tools like code generators, test harnesses, and visualization engines can work with directly.

This package also includes the Sift specification importer, which reads JSONL event streams from upstream domain modeling tools and converts them into `.moment` files, and the manifest scaffolder for initializing new Moment projects. Together these capabilities make `@mmmnt/core` the single entry point for getting domain specifications into the Moment pipeline, whether you are writing them by hand, importing them from an upstream tool, or starting a brand-new project from scratch.

## Installation

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

## Key Features

- **Langium-based parser** -- full grammar definition with syntax highlighting, error recovery, and precise diagnostic messages pointing to the exact line and column of issues.
- **Typed Intermediate Representation** -- a normalized, strongly-typed IR that downstream packages consume without needing to understand the raw AST.
- **Sift specification import** -- reads JSONL event streams from upstream domain modeling tools and converts them into `.moment` files with upstream fingerprint tracking.
- **Manifest scaffolding** -- initializes new Moment projects with the correct directory structure, manifest file, and starter specification.
- **File watching** -- monitors `.moment` files for changes and triggers rebuild callbacks for live development workflows.
- **Schema validation** -- the `SchemaValidator` service validates field-level schema definitions within the IR against the specification constraints.
- **Diagnostic pipeline** -- syntax errors, semantic warnings, and validation messages with source location information suitable for IDE integration.
- **Multi-file support** -- parse individual files or entire specification directories.
- **Deterministic output** -- the same input specification always produces the same IR, enabling reliable caching and incremental builds.

## API Reference

### Parser

| Export | Description |
|--------|-------------|
| `MomentParser` | Langium-based parser that reads `.moment` files and produces an AST with diagnostics. Supports single-file and directory-level parsing. |
| `astToIr(ast)` | Transforms a parsed AST into a typed Intermediate Representation. Performs semantic validation during the transformation. |

### Intermediate Representation Types

| Type | Description |
|------|-------------|
| `IntermediateRepresentation` | Top-level IR containing contexts, flows, moments, connections, glossary, and metadata. |
| `SpecificationMetadata` | Metadata about the parsed specification (file path, parse timestamp, version). |
| `ContextDefinition` | A bounded context with its aggregates, commands, events, policies, sagas, and domain services. |
| `AggregateDefinition` | An aggregate root with its commands, events, invariants, and value objects. |
| `CommandDefinition` | A command with its payload fields and preconditions. |
| `EventDefinition` | A domain event with its payload fields. |
| `ValueObjectDefinition` | A value object with its fields and validation rules. |
| `FieldDefinition` | A typed field within a command, event, or value object payload. |
| `InvariantDefinition` | A business invariant that must hold for an aggregate. |
| `PolicyDefinition` | A reactive policy triggered by events within a context. |
| `SagaDefinition` | A long-running process coordinating multiple aggregates or contexts. |
| `DomainServiceDefinition` | A stateless domain service performing operations across aggregates. |
| `PreconditionDefinition` | A precondition that must be satisfied before a command executes. |
| `FlowDefinition` | A cross-context flow describing step-by-step interactions between contexts. |
| `MomentDefinition` | A named moment (domain event) with its entries and branches. |
| `MomentEntry` | A single entry within a moment (step in a flow). |
| `BranchDefinition` | A branching condition within a moment. |
| `ConnectionDefinition` | A relationship between bounded contexts (event flow, dependency, shared kernel). |
| `ConnectionType` | The type of connection: event flow, dependency, or shared kernel. |
| `GlossaryEntry` | A domain glossary term with definition. |
| `SchemaContract` | A schema contract with field definitions for validation. |
| `SchemaFieldDefinition` | A field within a schema contract with type and constraints. |

### Parse Result Types

| Type | Description |
|------|-------------|
| `ParseResult` | Result of parsing a `.moment` file: AST, diagnostics, and source metadata. |
| `ValidationResult` | Result of validating a parsed specification. |
| `Diagnostic` | A diagnostic message with severity, message text, and source location. |
| `SourceLocation` | File path, line, and column for a diagnostic or IR element. |

### Import

| Export | Description |
|--------|-------------|
| `SiftSpecificationImporter` | Reads Sift JSONL event streams from a `.domain/` directory and produces `.moment` specification files. Tracks upstream fingerprints for drift detection. |

### Import Types

| Type | Description |
|------|-------------|
| `SiftBuildingBlock` | A building block type from the Sift event stream (context, aggregate, command, event, etc.). |
| `SiftTimelineEvent` | A parsed event from the Sift timeline. |
| `SiftImportInput` | Input configuration for the Sift importer (source directory, output directory). |
| `ImportResult` | Result of a Sift import with file counts, context counts, and fingerprint. |
| `UpstreamFingerprint` | Hash fingerprint of the upstream specification for drift tracking. |

### Manifest

| Export | Description |
|--------|-------------|
| `ManifestScaffolder` | Initializes a new Moment project with directory structure and manifest file. Accepts `ScaffoldOptions`. |
| `ManifestReader` | Reads and parses an existing `moment.manifest.json`. Returns `ManifestConfiguration`. |
| `ManifestUpdater` | Updates manifest entries after code generation or sync operations. Returns `ManifestUpdateResult`. |

### Manifest Types

| Type | Description |
|------|-------------|
| `ScaffoldOptions` | Options for scaffolding a new project (name, output directory). |
| `ScaffoldResult` | Result of scaffolding with list of created files and directories. |
| `ManifestUpdateResult` | Result of a manifest update operation. |
| `ManifestConfiguration` | Parsed manifest configuration with file references and generator configs. |
| `WatchConfiguration` | File watching configuration from the manifest. |
| `FileRef` | A file reference within the manifest. |
| `GeneratorConfig` | Configuration for a specific generator within the manifest. |

### Services

| Export | Description |
|--------|-------------|
| `SchemaValidator` | Validates field-level schema definitions within the IR against specification constraints. |

### Infrastructure

| Export | Description |
|--------|-------------|
| `FileWatcher` | Watches `.moment` files for changes and triggers rebuild callbacks. Built on chokidar for cross-platform file system events. Accepts `FileWatcherOptions`. |
| `RegenerateOnMomentFileChanged` | Policy that orchestrates regeneration when spec files change. Coordinates parser invocation and downstream notification. Returns `RegenerateResult`. |

## Examples

### Parsing and Inspecting a Specification

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';

const parser = new MomentParser();
const parseResult = parser.parse('specs/vet-clinic.moment');

// Check for diagnostics
for (const diag of parseResult.diagnostics) {
  console.log(`[${diag.severity}] Line ${diag.range.start.line}: ${diag.message}`);
}

// Inspect the IR
const ir = astToIr(parseResult.ast);

for (const ctx of ir.contexts) {
  console.log(`Context: ${ctx.name}`);
  for (const agg of ctx.aggregates) {
    console.log(`  Aggregate: ${agg.name}`);
    console.log(`    Commands: ${agg.commands.map(c => c.name).join(', ')}`);
    console.log(`    Events: ${agg.events.map(e => e.name).join(', ')}`);
    console.log(`    Invariants: ${agg.invariants.map(i => i.name).join(', ')}`);
  }
}

for (const flow of ir.flows) {
  console.log(`Flow: ${flow.name} (${flow.steps.length} steps)`);
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
console.log(`Files written: ${result.filesWritten}`);
console.log(`Upstream fingerprint: ${result.fingerprint}`);
```

### Scaffolding a New Project

```typescript
import { ManifestScaffolder } from '@mmmnt/core';

const scaffolder = new ManifestScaffolder();
const result = await scaffolder.scaffold({
  projectName: 'my-service',
  outputDir: '.',
});

// Creates:
//   ./moment.manifest.json
//   ./specs/my-service.moment (starter specification)
console.log(`Created ${result.filesCreated.length} files`);
```

### Watch Mode for Development

```typescript
import { MomentParser, astToIr, FileWatcher } from '@mmmnt/core';

const parser = new MomentParser();
const watcher = new FileWatcher();

watcher.watch('specs/', async (filePath) => {
  console.log(`File changed: ${filePath}`);
  const result = parser.parse(filePath);
  if (result.diagnostics.length === 0) {
    const ir = astToIr(result.ast);
    console.log(`Re-parsed: ${ir.contexts.length} contexts, ${ir.flows.length} flows`);
  } else {
    console.log(`Parse errors: ${result.diagnostics.length}`);
  }
});
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
  +-- @mmmnt/mcp         (exposes all packages via MCP protocol)
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

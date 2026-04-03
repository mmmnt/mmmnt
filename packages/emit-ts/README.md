# @mmmnt/emit-ts

TypeScript type definitions and test scaffold generation from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/emit-ts.svg)](https://www.npmjs.com/package/@mmmnt/emit-ts)

## Overview

`@mmmnt/emit-ts` generates TypeScript source code from your `.moment` specification files. It produces strongly-typed interfaces for commands, events, and value objects, aggregate root classes annotated with JSDoc documentation, discriminated event union types, and ready-to-fill test scaffold files.

The generated code serves as the type-safe contract between your domain specification and its implementation. Instead of manually translating domain models into TypeScript types, this package keeps them in sync automatically. When your specification changes, regenerate to get updated types that reflect the current state of your domain model.

Test scaffolds provide a starting point for each derived test case, pre-populated with the correct types, setup steps, and assertion signatures so you can focus on writing the actual test logic rather than boilerplate. The scaffold emitter respects existing test implementations -- it generates stubs only for new test cases and does not overwrite files you have already filled in.

## Installation

```bash
npm install @mmmnt/emit-ts
```

Or with other package managers:

```bash
pnpm add @mmmnt/emit-ts
yarn add @mmmnt/emit-ts
```

## Quick Start

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';

const parser = new MomentParser();
const { ast } = parser.parse('path/to/spec.moment');
const ir = astToIr(ast);
const topology = deriveTopology(ir);

// Generate TypeScript type definitions
const emitter = new TypeScriptEmitter();
const tsOutput = emitter.emit(ir);

for (const file of tsOutput.files) {
  console.log(`Generated: ${file.path} (${file.content.length} bytes)`);
}

// Generate test scaffolds
const scaffoldEmitter = new TestScaffoldEmitter();
const scaffoldOutput = scaffoldEmitter.emit(ir, topology);

for (const file of scaffoldOutput.files) {
  console.log(`Scaffold: ${file.path}`);
}
```

## Key Features

- **TypeScript interface generation** -- produces strongly-typed interfaces for every command, event, and value object defined in your specification.
- **Discriminated union types** -- generates union types for all events within a context, enabling exhaustive pattern matching in switch statements and reducers.
- **Aggregate root classes** -- creates class stubs annotated with JSDoc documenting invariants and behavioral contracts from the specification.
- **Test scaffold generation** -- produces ready-to-fill test files for each derived test case, with typed imports, setup blocks, and assertion stubs.
- **Configurable conventions** -- control output directory structure, naming conventions (camelCase, PascalCase), and JSDoc verbosity through `EmitOptions`.
- **Scoped generation** -- use `GenerationScope` to limit generation to specific contexts or flows, useful for incremental regeneration in large specifications.
- **Policy-driven automation** -- the `EmitTypeScriptOnTopologyDerived` policy triggers emission automatically when a topology is derived, enabling watch-mode workflows.
- **Idempotent output** -- the same specification always produces identical TypeScript output, making generated files safe to commit to version control.

## Generated Output

### Type Definitions

For each bounded context, the emitter produces:

- **Command interfaces** with typed payload fields matching the specification schema
- **Event interfaces** with typed payload fields and event name discriminators
- **Discriminated union types** for all events within a context
- **Value object interfaces** for shared domain types
- **Aggregate root classes** with JSDoc documenting invariants and behavior

### Test Scaffolds

For each derived test case, the scaffold emitter produces:

- **Test file** with imports for the relevant types
- **Setup block** pre-populated with the required preconditions from the derived topology
- **Assertion stubs** matching the expected outcomes, ready for implementation

## API Reference

### Emitters

| Export | Description |
|--------|-------------|
| `TypeScriptEmitter` | Generates TypeScript interfaces, union types, and aggregate root classes from the IR. Accepts `EmitOptions` to control output directory, naming conventions, and JSDoc generation. |
| `TestScaffoldEmitter` | Generates test scaffold files from the IR and derived topology. Each scaffold includes typed imports, setup steps, and assertion stubs. |

### Policies

| Export | Description |
|--------|-------------|
| `EmitTypeScriptOnTopologyDerived` | Policy that triggers TypeScript emission automatically when a topology is derived. Returns `EmitTypeScriptResult` with file counts and diagnostics. |

### Key Types

| Type | Description |
|------|-------------|
| `EmitOptions` | Configuration for the TypeScript emitter: output path, naming conventions, JSDoc toggle. |
| `TypeScriptEmitterOutput` | Result containing generated file paths and contents. |
| `TestScaffoldEmitterOutput` | Result containing generated scaffold file paths and contents. |
| `GenerationScope` | Controls which contexts and flows to include in generation. |
| `GenerationResult` | Summary of a generation run with file counts and diagnostics. |
| `TypeScriptConvention` | Naming and formatting conventions for generated code. |
| `TestScaffoldResult` | Summary of scaffold generation with new and skipped file counts. |
| `EmitTypeScriptResult` | Result from the automated emission policy. |

## Examples

### Generating Types for a Single Context

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { TypeScriptEmitter } from '@mmmnt/emit-ts';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const emitter = new TypeScriptEmitter();
const output = emitter.emit(ir, {
  outputDir: './generated/',
  scope: { contexts: ['Scheduling'] },
});

// Output files might include:
//   generated/scheduling/commands.ts
//   generated/scheduling/events.ts
//   generated/scheduling/value-objects.ts
//   generated/scheduling/aggregate.ts
for (const file of output.files) {
  console.log(`${file.path}`);
}
```

### Generating Test Scaffolds Alongside Types

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);
const topology = deriveTopology(ir);

// Generate types
const typeEmitter = new TypeScriptEmitter();
const types = typeEmitter.emit(ir);

for (const file of types.files) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.content);
}

// Generate test scaffolds
const scaffoldEmitter = new TestScaffoldEmitter();
const scaffolds = scaffoldEmitter.emit(ir, topology);

for (const file of scaffolds.files) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.content);
}

console.log(`Generated ${types.files.length} type files and ${scaffolds.files.length} scaffold files`);
```

### Automated Emission in Watch Mode

```typescript
import { MomentParser, astToIr, FileWatcher } from '@mmmnt/core';
import { deriveTopology, DeriveOnSpecificationParsed } from '@mmmnt/derive';
import { EmitTypeScriptOnTopologyDerived } from '@mmmnt/emit-ts';

const parser = new MomentParser();
const watcher = new FileWatcher();

const emitPolicy = new EmitTypeScriptOnTopologyDerived();
const derivePolicy = new DeriveOnSpecificationParsed({
  onTopologyDerived: async (topology) => {
    const result = await emitPolicy.handle(topology);
    console.log(`Emitted ${result.tsFileCount} type files, ${result.scaffoldFileCount} scaffolds`);
  },
});

watcher.watch('specs/', async (filePath) => {
  const { ast } = parser.parse(filePath);
  const ir = astToIr(ast);
  await derivePolicy.handle(ir);
});
```

## Integration

`@mmmnt/emit-ts` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It is consumed by downstream packages:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/emit-ts
                                       |
                                       +-- @mmmnt/sync      (baseline for drift detection)
                                       +-- @mmmnt/harness   (type contracts for test execution)
                                       +-- @mmmnt/cli       (exposed via `moment emit-ts`)
                                       +-- @mmmnt/mcp       (exposed via `moment_emit_ts` tool)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/emit-ts
pnpm --filter @mmmnt/emit-ts test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

# @mmmnt/emit-ts

TypeScript code generation from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/emit-ts.svg)](https://www.npmjs.com/package/@mmmnt/emit-ts)

## Overview

`@mmmnt/emit-ts` generates TypeScript source code from your `.moment` specification files. It produces strongly-typed interfaces for commands, events, and value objects, aggregate root classes annotated with JSDoc documentation, discriminated event union types, and ready-to-fill test scaffold files.

The generated code serves as the type-safe contract between your domain specification and its implementation. Instead of manually translating domain models into TypeScript types, this package keeps them in sync automatically. When your specification changes, regenerate to get updated types that reflect the current state of your domain model.

Test scaffolds provide a starting point for each derived test case, pre-populated with the correct types, setup steps, and assertion signatures so you can focus on writing the actual test logic.

## Installation

```bash
npm install @mmmnt/emit-ts
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

## Generated Output

### Type Definitions

For each bounded context, the emitter produces:

- **Command interfaces** with typed payload fields
- **Event interfaces** with typed payload fields
- **Discriminated union types** for all events within a context
- **Value object interfaces** for shared domain types
- **Aggregate root classes** with JSDoc documenting invariants and behavior

### Test Scaffolds

For each derived test case, the scaffold emitter produces:

- **Test file** with imports for the relevant types
- **Setup block** pre-populated with the required preconditions
- **Assertion stubs** matching the expected outcomes from the derived topology

## API Reference

### Emitters

| Export | Description |
|--------|-------------|
| `TypeScriptEmitter` | Generates TypeScript interfaces, union types, and aggregate root classes from the IR. Accepts `EmitOptions` to control output directory, naming conventions, and JSDoc generation. |
| `TestScaffoldEmitter` | Generates test scaffold files from the IR and derived topology. Each scaffold includes typed imports, setup steps, and assertion stubs. |

### Policies

| Export | Description |
|--------|-------------|
| `EmitTypeScriptOnTopologyDerived` | Policy that triggers TypeScript emission automatically when a topology is derived. |

### Key Types

| Type | Description |
|------|-------------|
| `EmitOptions` | Configuration for the TypeScript emitter (output path, conventions). |
| `TypeScriptEmitterOutput` | Result containing generated file paths and contents. |
| `TestScaffoldEmitterOutput` | Result containing generated scaffold file paths and contents. |
| `GenerationScope` | Controls which contexts and flows to include in generation. |
| `GenerationResult` | Summary of a generation run with file counts and diagnostics. |
| `TypeScriptConvention` | Naming and formatting conventions for generated code. |

## Integration

`@mmmnt/emit-ts` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It is consumed by:

- **@mmmnt/sync** uses the emitted TypeScript as the baseline for drift detection against implementation code.
- **@mmmnt/harness** executes tests against the generated type contracts.
- **@mmmnt/cli** exposes emission via the `moment emit-ts` command.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

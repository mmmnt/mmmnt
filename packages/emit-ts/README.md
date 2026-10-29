# @mmmnt/emit-ts

TypeScript type definitions and test scaffold generation from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/emit-ts.svg)](https://www.npmjs.com/package/@mmmnt/emit-ts)

## Overview

`@mmmnt/emit-ts` generates TypeScript source code from your `.moment` specification files. It produces strongly-typed interfaces for commands, events, and value objects, aggregate root interfaces annotated with JSDoc, discriminated event union types, read-model types for each context's value objects, projections, and queries, and ready-to-fill test scaffold files.

The generated code serves as the type-safe contract between your domain specification and its implementation. Instead of manually translating domain models into TypeScript types, this package keeps them in sync automatically. When your specification changes, regenerate to get updated types that reflect the current state of your domain model.

Test scaffolds provide a starting point for each derived test case, pre-populated with setup comments and assertion stubs so you can focus on writing the actual test logic rather than boilerplate. Both emitters are pure: they return file paths and contents in memory and write nothing to disk, so your code (or the `moment emit-ts` command) decides where the files go.

## Installation

Requires Node.js 22 or newer.

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
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';

const path = 'path/to/spec.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;
const topology = deriveTopology(ir);

// Generate TypeScript type definitions
const emitter = new TypeScriptEmitter();
const tsOutput = emitter.emit(ir, { scope: { level: 'system' } });

for (const [file, content] of tsOutput.files) {
  console.log(`Generated: ${file} (${content.length} bytes)`);
}

// Generate test scaffolds
const scaffoldEmitter = new TestScaffoldEmitter();
const scaffoldOutput = scaffoldEmitter.emit(ir, topology);

for (const file of scaffoldOutput.files.keys()) {
  console.log(`Scaffold: ${file}`);
}
```

## Key Features

- **TypeScript interface generation** -- produces strongly-typed interfaces for every command, event, and value object defined in your specification.
- **Read-model types** -- emits a `read-model.types.ts` per context for value objects declared at the context level, projections (one interface per projection), and queries (a `<Query>Query` input interface and a `<Query>Result` type naming the projections it reads).
- **Discriminated union types** -- generates a `<Context>Event` union of all events within a context, enabling exhaustive pattern matching in switch statements and reducers.
- **Aggregate root interfaces** -- creates an `<Aggregate>Aggregate` interface with one handler per command, annotated with JSDoc for preconditions (`@precondition`) and emitted events (`@emits`).
- **Deprecated fields** -- fields the specification marks as deprecated carry a `@deprecated` JSDoc tag with the reason and replacement.
- **Test scaffold generation** -- produces a spec file per flow and per aggregate, with setup comments and assertion stubs.
- **Scoped generation** -- use `GenerationScope` to emit the whole system, selected contexts, or selected aggregates, useful for incremental regeneration in large specifications.
- **Policy-driven automation** -- the `EmitTypeScriptOnTopologyDerived` policy runs both emitters for a derived topology and can be registered as a hook on `DeriveOnSpecificationParsed`.
- **Idempotent output** -- the same specification always produces identical TypeScript output, making generated files safe to commit to version control.

## Generated Output

### Type Definitions

Paths are relative to the output directory. For each bounded context (directory name in kebab case), the emitter produces:

- `src/<context>/<aggregate>.types.ts` -- **value object, command, and event interfaces** for the aggregate, with typed fields matching the specification schema
- `src/<context>/<aggregate>.aggregate.ts` -- the **aggregate root interface** with JSDoc documenting preconditions and emitted events
- `src/<context>/read-model.types.ts` -- **read-model types** for the context's own value objects, projections, and queries (only when the context declares any)
- `src/<context>/index.ts` -- a barrel re-exporting the above, plus the **discriminated event union** for the context
- `src/index.ts` -- a root barrel re-exporting every context

For a context with a projection and a query such as:

```
context "Retrieval" [Core]
  value-object TokenBudget
    tokens: number

  projection TrajectoryResult
    sources DecisionMade
    field entryId: UUID

  query QueryContext
    reads TrajectoryResult
    input query: string, budget: TokenBudget
```

`read-model.types.ts` contains:

```typescript
/**
 * Read side of the Retrieval context.
 */

export interface TokenBudget {
  readonly tokens: number;
}

export interface TrajectoryResult {
  readonly entryId: string;
}

export interface QueryContextQuery {
  readonly query: string;
  readonly budget: TokenBudget;
}

export type QueryContextResult = TrajectoryResult;
```

### Test Scaffolds

The scaffold emitter produces:

- `__tests__/flows/<flow>.spec.ts` -- one spec file per flow whose derived test cases carry assertions, with setup comments from the derived topology and an assertion stub per assertion point
- `__tests__/<context>/<aggregate>.spec.ts` -- one spec file per aggregate that declares commands or invariants

## API Reference

### Emitters

| Export | Description |
|--------|-------------|
| `TypeScriptEmitter` | `emit(ir, options)` generates TypeScript interfaces, union types, aggregate root interfaces, and read-model types from the IR. `EmitOptions` takes a required `scope` and an optional `dryRun` flag. Returns `TypeScriptEmitterOutput`. |
| `TestScaffoldEmitter` | `emit(ir, topology)` generates test scaffold files from the IR and derived topology. Returns `TestScaffoldEmitterOutput`. |

### Policies

| Export | Description |
|--------|-------------|
| `EmitTypeScriptOnTopologyDerived` | Policy whose `execute(ir, topology)` runs both emitters at system scope and returns an `EmitTypeScriptResult`. Its `handle(topology, ir)` matches the `TopologyDerivedHook` signature. |

### Key Types

| Type | Description |
|------|-------------|
| `EmitOptions` | Configuration for the TypeScript emitter: `scope` and optional `dryRun`. |
| `TypeScriptEmitterOutput` | `result` (a `GenerationResult`) and `files`, a `Map` of file path to content. |
| `TestScaffoldEmitterOutput` | `result` (a `TestScaffoldResult`) and `files`, a `Map` of file path to content. |
| `GenerationScope` | `level` (`system`, `context`, or `aggregate`) and optional `targets` naming the contexts or aggregates to include. |
| `GenerationResult` | Summary of a generation run: files written, unchanged, and removed, and whether it was a dry run. |
| `TypeScriptConvention` | File naming, directory structure, and import style conventions. |
| `TestScaffoldResult` | Spec files written and the number of scenarios scaffolded. |
| `EmitTypeScriptResult` | Result from the automated emission policy: `typeScriptOutput` and `scaffoldOutput`. |

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

### Generating Types for a Single Context

```typescript
import { TypeScriptEmitter } from '@mmmnt/emit-ts';

const emitter = new TypeScriptEmitter();
const output = emitter.emit(ir, {
  scope: { level: 'context', targets: ['Checkout'] },
});

// Output files include, per aggregate and context:
//   src/checkout/<aggregate>.types.ts
//   src/checkout/<aggregate>.aggregate.ts
//   src/checkout/read-model.types.ts   (when the context declares a read side)
//   src/checkout/index.ts
//   src/index.ts
for (const file of output.files.keys()) {
  console.log(file);
}
```

### Generating Test Scaffolds Alongside Types

```typescript
import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const topology = deriveTopology(ir);
const outDir = './generated';

const writeAll = (files: Map<string, string>): void => {
  for (const [file, content] of files) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
};

// Generate types
const types = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
writeAll(types.files);

// Generate test scaffolds
const scaffolds = new TestScaffoldEmitter().emit(ir, topology);
writeAll(scaffolds.files);

console.log(`Generated ${types.files.size} type files and ${scaffolds.files.size} scaffold files`);
```

### Automated Emission with Policies

```typescript
import { DeriveOnSpecificationParsed } from '@mmmnt/derive';
import { EmitTypeScriptOnTopologyDerived } from '@mmmnt/emit-ts';

const emitPolicy = new EmitTypeScriptOnTopologyDerived();
const derivePolicy = new DeriveOnSpecificationParsed({
  onTopologyDerived: [
    (topology, derivedIr) => {
      const { typeScriptOutput, scaffoldOutput } = emitPolicy.execute(derivedIr, topology);
      console.log(
        `Emitted ${typeScriptOutput.files.size} type files, ${scaffoldOutput.files.size} scaffolds`,
      );
    },
  ],
});

await derivePolicy.execute(ir);
```

## Integration

`@mmmnt/emit-ts` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It is consumed by downstream packages:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/emit-ts
                                       |
                                       +-- @mmmnt/sync      (baseline for drift detection)
                                       +-- @mmmnt/cli       (exposed via `moment emit-ts` and `moment generate`)
                                       +-- @mmmnt/mcp       (exposed via `moment_emit_ts` tool)
```

The `moment emit-ts` command accepts a single file or a model directory, which it loads as one project, and supports `--dry-run` and `--out <dir>`.

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

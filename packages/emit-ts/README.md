# @mmmnt/emit-ts

TypeScript type definitions and test scaffold generation from Moment domain specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/emit-ts.svg)](https://www.npmjs.com/package/@mmmnt/emit-ts)

## Overview

`@mmmnt/emit-ts` writes TypeScript from a Moment model:

- interfaces for every command, event and value object
- an aggregate root interface per aggregate, with one handler per command, typed by what the command emits
- a discriminated union of the events of each context
- read-model types for each context's value objects, projections and queries
- the events an orchestration records, as types of their own
- Vitest test scaffolds for the derived test cases, the commands and the invariants

Both emitters are pure. They return file paths and contents in memory and write nothing, so your code (or the `moment emit-ts` command) decides where the files go. The same model always emits the same files.

For the history of changes, see [CHANGELOG.md](CHANGELOG.md).

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

const path = 'examples/ticketwave/spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;

// TypeScript types
const types = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
console.log(`${types.files.size} type files, for example:`);
console.log([...types.files.keys()].filter((f) => f.startsWith('src/presale/')));

// Test scaffolds
const scaffolds = new TestScaffoldEmitter().emit(ir, deriveTopology(ir));
console.log(
  `${scaffolds.files.size} scaffold files, ${scaffolds.result.scenariosGenerated} test stubs`,
);
```

Output for TicketWave:

```
40 type files, for example:
[
  'src/presale/presale-window.types.ts',
  'src/presale/presale-window.aggregate.ts',
  'src/presale/access-code.types.ts',
  'src/presale/access-code.aggregate.ts',
  'src/presale/waitlist.types.ts',
  'src/presale/waitlist.aggregate.ts',
  'src/presale/index.ts'
]
21 scaffold files, 126 test stubs
```

## Generated Output

### Type Definitions

Paths are relative to the output directory. Context and aggregate names are written in kebab case.

| File                                     | Contents                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/<context>/<aggregate>.types.ts`     | the aggregate's value objects, then one interface per command (its inputs) and per event (its fields) |
| `src/<context>/<aggregate>.aggregate.ts` | `<Aggregate>Aggregate`: the identity field and one handler per command                                |
| `src/<context>/<saga>.process.types.ts`  | the events an orchestration declares, when it declares any                                            |
| `src/<context>/read-model.types.ts`      | the context's own value objects, projections and queries, when it declares any                        |
| `src/<context>/index.ts`                 | a barrel re-exporting the files above, and the `<Context>Event` union of the context's events         |
| `src/index.ts`                           | a root barrel re-exporting every context                                                              |

A query becomes a `<Query>Query` interface for its inputs and a `<Query>Result` type naming the projections it reads.

### Handlers and What a Command Emits

Each handler takes the command interface and returns what the command records:

| Declared          | Handler returns        |
| ----------------- | ---------------------- |
| `emits A`         | `A`                    |
| `emits A, B`      | `readonly [A, B]`      |
| `emits A \| B`    | `A \| B`               |
| `emits A, B \| C` | `readonly [A, B] \| C` |

A command that emits no event returns `void`. A repeated alternative is written once.

The JSDoc carries one `@precondition` per precondition, one `@emits` per distinct event, and `@outcome <State>: <events>` for each outcome with a `when <State>` guard. From TicketWave's `src/presale/access-code.aggregate.ts`:

```typescript
  /**
   * Handle RedeemAccessCode.
   * @precondition Access code must be valid and unredeemed
   * @precondition Associated presale window must be currently open
   * @precondition Code must not have exceeded its redemption limit
   * @emits AccessCodeRedeemed
   * @emits AccessCodeExhausted
   * @outcome Open: AccessCodeRedeemed
   * @outcome OneUseLeft: AccessCodeRedeemed, AccessCodeExhausted
   */
  redeemAccessCode(command: RedeemAccessCode): AccessCodeRedeemed | readonly [AccessCodeRedeemed, AccessCodeExhausted];
```

### Field Types

Every property is `readonly`. A field that is not required is written with `?`.

| Moment                               | TypeScript                                                      |
| ------------------------------------ | --------------------------------------------------------------- |
| `string`, `UUID`, `DateTime`, `Date` | `string`                                                        |
| `number`, `Money`                    | `number`                                                        |
| `boolean`                            | `boolean`                                                       |
| `T[]`                                | `readonly T[]`                                                  |
| `x?: T`                              | `readonly x?: T`                                                |
| `"a" \| "b"` (code set)              | `'a' \| 'b'`                                                    |
| `T{}` or `T{key}` (map)              | `Readonly<Record<string, T>>`                                   |
| `a: T \| b: U` (exclusive group)     | two optional properties, `a?: T` and `b?: U`                    |
| `value-object V: T` (scalar)         | `export type V = T`                                             |
| value object with `\| Variant` lines | a discriminated union on `kind`                                 |
| `[encrypted]`                        | the field's own (plaintext) type                                |
| `[deprecated "reason" -> "other"]`   | a `@deprecated reason (use other instead)` JSDoc tag            |
| any other type name                  | the name in PascalCase, imported from the file that declares it |

A `[pattern]` is not expressed in TypeScript. For a closed JSON Schema of every event payload, use `moment schema emit` from `@mmmnt/schema`.

From `fixtures/valid/field-types/field-types.moment`, a union value object:

```
value-object Arrival
  actor: Actor
  | Live
  | Replay
      replay: "Bootstrap" | "Resume"
  | Document
      documentVersion: DocumentVersion
      location: string
      contentHash?: ContentHash
```

is emitted in `src/intake/read-model.types.ts` as:

```typescript
export type Arrival =
  | {
      readonly kind: 'Live';
      readonly actor: Actor;
    }
  | {
      readonly kind: 'Replay';
      readonly actor: Actor;
      readonly replay: 'Bootstrap' | 'Resume';
    }
  | {
      readonly kind: 'Document';
      readonly actor: Actor;
      readonly documentVersion: DocumentVersion;
      readonly location: string;
      readonly contentHash?: ContentHash;
    };
```

### Built-in Types and Imports

The emitted files type-check on their own under `tsc --strict`.

`UUID`, `DateTime` and `Money` are written as the type of the value an event records, the same as `moment schema emit` writes them: `UUID` and `DateTime` are strings (a `DateTime` holds an ISO 8601 date-time) and `Money` is a number. No emitted file declares a type of that name. From TicketWave's `src/catalog/event.types.ts`:

```typescript
export interface RescheduleEvent {
  readonly eventId: string;
  readonly newStartsAt: string;
  readonly reason: string;
}
```

A file imports each declared type it names and does not declare itself, with `import type` and a relative path to the file that declares it. The type is looked up in the context's own files first (for an aggregate root, its own `.types.ts` file first), then in the other contexts in the order the model declares them. A name that no file declares is written as it is, with no import. From `src/intake/receipt.types.ts` of the field-types fixture:

```typescript
import type {
  Actor,
  Arrival,
  ContentHash,
  CorpusVersion,
  ReceiptEffect,
  RecordRef,
} from './read-model.types.js';
```

A type declared in another context is imported from that context's directory, for example `from '../ordering/order.types.js'`.

When two files of a context, or two contexts, declare the same name, `export *` alone would export neither. The barrel then re-exports that name from the first file or context that declares it. From the root barrel of the multi-context fixture:

```typescript
export * from './fulfillment/index.js';
export * from './ordering/index.js';
export * from './shipping/index.js';

// Declared in more than one context: exported from the first.
export type { OrderItem, ReservedItem } from './fulfillment/index.js';
export type { Address } from './ordering/index.js';
```

The other declaration stays available from its own context's barrel.

An emit at `context` or `aggregate` scope imports a type from the file that declares it even when that file is outside the scope. Emit at `system` scope for a set of files that compiles on its own.

### Test Scaffolds

`TestScaffoldEmitter.emit(ir, topology)` writes Vitest files of `it.todo` stubs:

| File                                      | Contents                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__tests__/flows/<flow>.spec.ts`          | one `describe` per derived test case that has assertion points, with its setup steps as comments in `beforeEach` and one stub per assertion, listing the expected fields |
| `__tests__/<context>/<aggregate>.spec.ts` | one stub per command and one per invariant, for an aggregate that declares either                                                                                        |

A flow whose test cases have no assertion points gets no file. `result.scenariosGenerated` counts the stubs: assertion points, commands and invariants.

## API Reference

### Emitters

| Export                | Description                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `TypeScriptEmitter`   | `emit(ir, options)` returns a `TypeScriptEmitterOutput`. `EmitOptions` takes a required `scope` and an optional `dryRun`. |
| `TestScaffoldEmitter` | `emit(ir, topology)` returns a `TestScaffoldEmitterOutput` from the IR and the topology `deriveTopology` derives.         |

### Policies

| Export                            | Description                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EmitTypeScriptOnTopologyDerived` | `execute(ir, topology)` runs both emitters, the types at system scope, and returns an `EmitTypeScriptResult`. `handle(topology, ir)` has the `TopologyDerivedHook` signature of `@mmmnt/derive` and discards the result. |

### Key Types

| Type                        | Description                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmitOptions`               | `scope` and optional `dryRun`.                                                                                                                                                   |
| `GenerationScope`           | `level` (`system`, `context` or `aggregate`) and optional `targets` naming the contexts or aggregates to include. At `aggregate` level no read-model or process file is emitted. |
| `TypeScriptEmitterOutput`   | `result` (a `GenerationResult`) and `files`, a `Map` of file path to content.                                                                                                    |
| `GenerationResult`          | `filesWritten` (every path in `files`), `filesUnchanged` and `filesRemoved` (both always empty: the emitter does not read the disk), and `dryRun` as passed.                     |
| `TestScaffoldEmitterOutput` | `result` (a `TestScaffoldResult`) and `files`, a `Map` of file path to content.                                                                                                  |
| `TestScaffoldResult`        | `specFilesWritten` and `scenariosGenerated`.                                                                                                                                     |
| `EmitTypeScriptResult`      | `typeScriptOutput` and `scaffoldOutput`.                                                                                                                                         |
| `TypeScriptConvention`      | `fileNaming`, `directoryStructure` and `importStyle`. Exported; no emitter reads it.                                                                                             |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start.

### Generating Types for a Single Context

```typescript
import { TypeScriptEmitter } from '@mmmnt/emit-ts';

const output = new TypeScriptEmitter().emit(ir, {
  scope: { level: 'context', targets: ['Checkout'] },
});

for (const file of output.files.keys()) {
  console.log(file);
}
```

Output:

```
src/checkout/cart.types.ts
src/checkout/cart.aggregate.ts
src/checkout/payment.types.ts
src/checkout/payment.aggregate.ts
src/checkout/index.ts
src/index.ts
```

### Writing Types and Scaffolds to Disk

```typescript
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deriveTopology } from '@mmmnt/derive';
import { TypeScriptEmitter, TestScaffoldEmitter } from '@mmmnt/emit-ts';

const outDir = './generated';

const writeAll = (files) => {
  for (const [file, content] of files) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
};

const types = new TypeScriptEmitter().emit(ir, { scope: { level: 'system' } });
writeAll(types.files);

const scaffolds = new TestScaffoldEmitter().emit(ir, deriveTopology(ir));
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

`@mmmnt/emit-ts` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for the test topology. These packages use it:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/emit-ts
                                       |
                                       +-- @mmmnt/sync      (the emitted types are the baseline for drift detection)
                                       +-- @mmmnt/cli       (`moment emit-ts`, `moment generate`, `moment sync`, `moment lint`)
                                       +-- @mmmnt/mcp       (the `moment_emit_ts` tool)
```

`moment emit-ts <file|dir> [--dry-run] [--out <dir>]` emits the types at system scope and the scaffolds. It accepts a single file or a model directory, which it loads as one project.

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

# @mmmnt/harness

Test execution engine with event replay and contract assertion for Moment-derived test suites.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/harness.svg)](https://www.npmjs.com/package/@mmmnt/harness)

## Overview

`@mmmnt/harness` runs the test suites that `@mmmnt/derive` derives from a model and reports whether the model holds together. It checks structure against the IR and payloads you hand it. It does not run against a live system.

It has three parts:

| Export                    | What it checks                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `TestRunner`              | every derived test case, structurally, against the IR. This is what `moment test` runs            |
| `EventReplayEngine`       | that every placement of a flow resolves: to a context, a branch-lane or a declared external       |
| `ContractAssertionEngine` | a payload against a crossing's schema contract: required fields present, values of the right type |

To replay the derived scenarios step by step and assert paths, crossings, branches and saga transitions, use [Facet](https://facet.mmmnt.dev), which reads what `moment simulate` writes.

For the history of changes, see [CHANGELOG.md](CHANGELOG.md).

## Installation

Requires Node.js 22 or newer.

```bash
npm install @mmmnt/harness
```

Or with other package managers:

```bash
pnpm add @mmmnt/harness
yarn add @mmmnt/harness
```

## Quick Start

```typescript
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TestRunner } from '@mmmnt/harness';

const path = 'examples/ticketwave/spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;

const run = new TestRunner().run(deriveTopology(ir), ir);

console.log(
  `${run.suitesRun} suites: ${run.testsPassed} passed, ` +
    `${run.testsFailed} failed, ${run.testsSkipped} skipped`,
);
```

Output for TicketWave:

```
8 suites: 92 passed, 0 failed, 0 skipped
```

`moment test examples/ticketwave/spec/ticketwave.moment` prints the same counts and exits 1 when a test fails:

```
Tests: 92 total, 92 passed, 0 failed, 0 skipped (8 suite(s))
```

## What the Test Runner Checks

For every test case of every suite, `run(topology, ir)` first checks that each context a setup step names, and each source and target context of an assertion point, exists in the IR. Then it dispatches on the `assertionType` of the case's first assertion point:

| First assertion    | The case passes when                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saga`             | for the start case, the saga's trigger exists (a command of the orchestration, or an event in the IR); for a transition case, the two states are adjacent in the saga's `states`; for the compensation case, the saga declares both a compensation and a timeout |
| `policy-chain`     | the policy exists, its trigger event exists in the IR, and its `chains-to` command exists in an aggregate, a context or an orchestration                                                                                                                         |
| any other, or none | the moment exists in its flow                                                                                                                                                                                                                                    |

A suite whose flow is not in the IR is counted as skipped. Every result is entered in `traceabilityMap`, keyed `<flowId>::<momentId>[<variant>]`, with the id of the case's first assertion point (a crossing, saga or policy id), or `<flowId>/<momentId>` when it has none.

## API Reference

### Test Execution

| Export       | Description                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `TestRunner` | `run(topology, ir)` evaluates every test case of a `TestSuiteTopology` and returns a `TestRunResult`. |

### Event Replay

| Export              | Description                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EventReplayEngine` | `replay(flow, ir)` walks the moments of a flow in order, main entries and then every branch's entries, and records at most one `DivergencePoint` per moment: the first entry that does not resolve. Returns a `ReplayResult`. |

### Contract Validation

| Export                    | Description                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContractAssertionEngine` | `new ContractAssertionEngine(ir?)`. With the IR, a value object field is checked as declared. `validate(crossingId, payload, contract)` checks a payload against a `SchemaContract` and returns a `ContractValidationResult`. `validateAll` is the same check. `coversAllRequiredFields(payload, fields)` returns whether every required field is present and not null. |

### Key Types

| Type                       | Description                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TestRunResult`            | `suitesRun`, `testsPassed`, `testsFailed`, `testsSkipped`, and `traceabilityMap` from test id to specification element.                                                                                                                                                                                                                     |
| `ReplayResult`             | `flowId`, `stepsReplayed` (the number of moments), `divergencePoints`, and `finalStateMatch` (true when there are none).                                                                                                                                                                                                                    |
| `DivergencePoint`          | `momentIndex`, `expectedState`, `actualState`, and `eventThatCaused` (the node name of the entry).                                                                                                                                                                                                                                          |
| `ContractValidationResult` | `crossingId`, `valid`, and `violations`.                                                                                                                                                                                                                                                                                                    |
| `ContractViolation`        | `fieldName` (a path such as `actor.sub` or `ids[1]` inside a value), `expected` (the type), `actual` (the value's JSON type, the value itself for a wrong form or code, or `missing`), and `constraintViolated`: `required field missing`, `type mismatch`, `format mismatch`, `pattern mismatch`, `not in code set` or `exclusive fields`. |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start.

### Replaying Every Flow

```typescript
import { EventReplayEngine } from '@mmmnt/harness';

const engine = new EventReplayEngine();
const replays = ir.flows.map((flow) => engine.replay(flow, ir));

for (const replay of replays) {
  if (replay.finalStateMatch) continue;
  console.log(`Flow ${replay.flowId}: ${replay.divergencePoints.length} divergence(s)`);
  for (const d of replay.divergencePoints) {
    console.log(`  moment ${d.momentIndex} (${d.eventThatCaused}): ${d.actualState}`);
  }
}
console.log(
  `${replays.length} flows replayed, ${replays.filter((r) => !r.finalStateMatch).length} diverged`,
);
```

Output for TicketWave:

```
8 flows replayed, 0 diverged
```

A placement resolves in one of three ways:

| The placement's lane                               | It resolves when                                     |
| -------------------------------------------------- | ---------------------------------------------------- |
| a `lane` of a context                              | the IR defines the context                           |
| a `branch-lane`, or a lane classified `[Terminal]` | always. The lane routes an outcome and is no context |
| a lane classified `[External]`                     | the IR declares an external of the lane's label      |

So `invalidCode: AccessCodeInvalidated [terminal]` on N2's `branch-lane invalidCode "Invalid Code" [Terminal]` is no divergence. This is how `moment parse` treats branch-lanes too. Lanes resolve per flow: a placement on a lane that the flow does not declare, or on a context the IR does not define, is a divergence. With a placement `GhostHappened` in a context `Ghost` that the model does not define, added to the second moment of N2, the example prints:

```
Flow flow-N2 - Presale access: 1 divergence(s)
  moment 1 (GhostHappened): context ctx-Ghost not found
```

### Validating a Payload Against a Crossing Contract

```typescript
import { randomUUID } from 'node:crypto';
import { ContractAssertionEngine } from '@mmmnt/harness';

const flow = ir.flows.find((f) => f.name === 'N2 - Presale access');
const crossing = flow.connections.find(
  (c) => c.connectionType === 'crosses-to' && c.schemaContract?.eventType === 'SeatsHeld',
);
console.log(crossing.schemaContract.fields.map((f) => `${f.name}: ${f.type}`).join(', '));

// e.g. a payload captured from your implementation
const payload = {
  holdId: 'h-1',
  quantity: '2',
  customerId: randomUUID(),
  expiresAt: '2026-01-01T10:15:00Z',
};
const result = new ContractAssertionEngine(ir).validate(
  crossing.id,
  payload,
  crossing.schemaContract,
);

console.log(`valid: ${result.valid}`);
for (const v of result.violations) {
  console.log(
    `  ${v.fieldName}: ${v.constraintViolated} (expected ${v.expected}, got ${v.actual})`,
  );
}
```

Output:

```
holdId: UUID, eventId: UUID, tierId: UUID, quantity: number, customerId: UUID, expiresAt: DateTime
valid: false
  holdId: format mismatch (expected UUID, got "h-1")
  eventId: required field missing (expected UUID, got missing)
  tierId: required field missing (expected UUID, got missing)
  quantity: type mismatch (expected number, got string)
```

`customerId` is a UUID and `expiresAt` a date-time, so both pass.

A missing or `null` value fails only a required field. A present value is checked against its Moment type, mapped as `@mmmnt/schema` maps it to JSON Schema (ADR-049):

| Contract type       | A value matches when it is                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| `string`, `boolean` | a JSON string or boolean                                                            |
| `number`, `Money`   | a finite number                                                                     |
| `UUID`              | a string in the form `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, hex digits in any case |
| `DateTime`          | an RFC 3339 date-time string with an offset, such as `2026-01-01T10:00:00.000Z`     |
| `Date`              | an RFC 3339 date string of a real day, such as `2026-01-01`                         |
| `T[]`               | an array whose every item matches `T`. A bad item is named by index, as `ids[1]`    |
| a value object      | an object. Without the IR, any object that is not an array                          |

A value of the wrong JSON type is a `type mismatch`. A string of the right type but the wrong form is a `format mismatch`.

Pass the IR to the constructor, as above, and a value object is checked as the model declares it:

- a record value object: each of its fields, by the same rules, required ones present. A violation names the path, as `actor.sub`.
- a scalar value object (`value-object ContentHash: string [pattern "..."]`): the value is its scalar, with its pattern.
- a code set (`value-object ActorKind: "user" | "api" | "system"`, or a field typed `"a" | "b"`): the value is one of its strings, else `not in code set`.
- a tagged union: the value's `kind` names a variant, else `not in code set`, and the common and that variant's fields are checked.
- a map (`T{}`): every value matches `T`. An exclusive group (`a: T | b: U`): exactly one member is present, else `exclusive fields`. An `[encrypted]` field: `{dataKeyId, ciphertext}`, both strings. A `[pattern]`: else `pattern mismatch`.

A crossing's `contract` writes a code set or a map of its own as its value type only, so those checks apply to a field typed with a value object. Fields the contract does not list are not checked.

## Integration

`@mmmnt/harness` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for the test topology:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/harness
                                       |
                                       +-- @mmmnt/cli  (`moment test`)
```

`moment test <file|dir>` derives the topology and runs `TestRunner`. It accepts a single file or a model directory, which it loads as one project.

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and contribution guidelines.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/harness
pnpm --filter @mmmnt/harness test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

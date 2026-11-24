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
| `EventReplayEngine`       | that every placement of a flow names a context the IR defines                                     |
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

| Export              | Description                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EventReplayEngine` | `replay(flow, ir)` walks the moments of a flow in order, main entries and then every branch's entries, and records at most one `DivergencePoint` per moment: the first entry whose context the IR does not define. Returns a `ReplayResult`. |

### Contract Validation

| Export                    | Description                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContractAssertionEngine` | `validate(crossingId, payload, contract)` checks a payload against a `SchemaContract` and returns a `ContractValidationResult`. `validateAll` is the same check. `coversAllRequiredFields(payload, fields)` returns whether every required field is present and not null. |

### Key Types

| Type                       | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TestRunResult`            | `suitesRun`, `testsPassed`, `testsFailed`, `testsSkipped`, and `traceabilityMap` from test id to specification element.                                        |
| `ReplayResult`             | `flowId`, `stepsReplayed` (the number of moments), `divergencePoints`, and `finalStateMatch` (true when there are none).                                       |
| `DivergencePoint`          | `momentIndex`, `expectedState`, `actualState`, and `eventThatCaused` (the node name of the entry).                                                             |
| `ContractValidationResult` | `crossingId`, `valid`, and `violations`.                                                                                                                       |
| `ContractViolation`        | `fieldName`, `expected` (the contract type), `actual` (the value's type, or `missing`), and `constraintViolated`: `required field missing` or `type mismatch`. |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start.

### Replaying Every Flow

```typescript
import { EventReplayEngine } from '@mmmnt/harness';

const engine = new EventReplayEngine();

for (const flow of ir.flows) {
  const replay = engine.replay(flow, ir);
  if (replay.finalStateMatch) continue;
  console.log(`Flow ${replay.flowId}: ${replay.divergencePoints.length} divergence(s)`);
  for (const d of replay.divergencePoints) {
    console.log(`  moment ${d.momentIndex} (${d.eventThatCaused}): ${d.actualState}`);
  }
}
```

Output for TicketWave (excerpt):

```
Flow flow-N2 - Presale access: 1 divergence(s)
  moment 2 (AccessCodeInvalidated): context ctx-Invalid Code not found
```

A placement on a `branch-lane` (here `invalidCode: AccessCodeInvalidated [terminal]`) names the lane, not a context, so the engine reports it as a divergence although the model is valid. TicketWave reports five such divergences, in N1 to N4.

### Validating a Payload Against a Crossing Contract

```typescript
import { ContractAssertionEngine } from '@mmmnt/harness';

const flow = ir.flows.find((f) => f.name === 'N2 - Presale access');
const crossing = flow.connections.find(
  (c) => c.connectionType === 'crosses-to' && c.schemaContract?.eventType === 'SeatsHeld',
);
console.log(crossing.schemaContract.fields.map((f) => `${f.name}: ${f.type}`).join(', '));

// e.g. a payload captured from your implementation
const payload = { holdId: 'h-1', quantity: '2', customerId: 'c-1' };
const result = new ContractAssertionEngine().validate(
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
  holdId: type mismatch (expected UUID, got string)
  eventId: required field missing (expected UUID, got missing)
  tierId: required field missing (expected UUID, got missing)
  quantity: type mismatch (expected number, got string)
  customerId: type mismatch (expected UUID, got string)
  expiresAt: required field missing (expected DateTime, got missing)
```

A missing or `null` value fails only a required field. A present value matches when its JavaScript type (`typeof`, or `array` for an array) equals the contract type in lower case. Only `string`, `number` and `boolean` can match that way, so a value for a `UUID`, `DateTime`, `Date` or `Money` field, or for a value object, is always reported as a type mismatch, as `holdId` and `customerId` are above.

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

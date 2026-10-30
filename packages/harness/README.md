# @mmmnt/harness

Test execution engine with event replay and contract assertion for Moment-derived test suites.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/harness.svg)](https://www.npmjs.com/package/@mmmnt/harness)

## Overview

`@mmmnt/harness` runs the test suites that `@mmmnt/derive` produces from a `.moment` specification and reports whether the specification holds together. It is infrastructure-agnostic: it validates against the intermediate representation (IR) and against payloads you hand it, not against a running system.

The test runner walks every derived suite and evaluates each test case structurally against the IR: the contexts a case sets up and asserts across must exist, moment cases must name a moment in their flow, saga cases check their trigger, state adjacency, compensation and timeout, and policy-chain cases check their trigger event and the command they chain to. Every result is traceable to the specification element it came from.

The event replay engine replays a flow's moments in order and reports a divergence point wherever a moment names a context the IR does not define. The contract assertion engine validates an event payload against a crossing's schema contract, reporting missing required fields and type mismatches.

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

const path = 'path/to/spec.moment';
const { ir } = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!ir) throw new Error('parse failed');

const result = new TestRunner().run(deriveTopology(ir), ir);

console.log(
  `${result.suitesRun} suites: ${result.testsPassed} passed, ` +
    `${result.testsFailed} failed, ${result.testsSkipped} skipped`,
);
```

## Key Features

- **Test suite execution** -- runs every derived suite against the IR and aggregates passed, failed, and skipped counts; a suite whose flow is missing from the IR is skipped.
- **Traceability (TE-01)** -- every test result maps to its originating specification element in `traceabilityMap`.
- **Structural saga validation (TE-03)** -- dispatches on `assertionType: 'saga'` to validate that the trigger exists in the IR, that states are adjacent in the saga chain, and that both compensation and timeout are defined.
- **Structural policy chain validation (TE-04)** -- dispatches on `assertionType: 'policy-chain'` to validate that the trigger event exists in the IR and that the `chainsTo` command exists in the IR.
- **Event replay** -- replays a flow's moments, including branch entries, and records a divergence point for each moment that names an undefined context.
- **Contract assertion (TE-02)** -- validates a payload against a `SchemaContract`, reporting required fields that are missing and values whose type does not match the contract.
- **CI/CD integration** -- exposed as `moment test`, which exits non-zero when any test fails.

## API Reference

### Test Execution

| Export | Description |
|--------|-------------|
| `TestRunner` | `run(topology, ir)` evaluates every test case of a `TestSuiteTopology` against the IR. Dispatches on the `assertionType` of each test case's first assertion: `'saga'` and `'policy-chain'` take their structural paths; anything else checks that the moment exists in its flow. Returns `TestRunResult`. |

### Event Replay

| Export | Description |
|--------|-------------|
| `EventReplayEngine` | `replay(flow, ir)` replays a `FlowDefinition`'s moments against the IR's contexts. Returns `ReplayResult`. |

### Contract Validation

| Export | Description |
|--------|-------------|
| `ContractAssertionEngine` | `validate(crossingId, payload, contract)` checks a payload against a `SchemaContract` and returns `ContractValidationResult`. `coversAllRequiredFields(payload, fields)` returns whether every required field is present. |

### Key Types

| Type | Description |
|------|-------------|
| `TestRunResult` | Suites run, tests passed, failed, and skipped, and the traceability map from test id to specification element. |
| `DivergencePoint` | Where a replay diverged: moment index, expected and actual state, and the node that caused it. |
| `ReplayResult` | Flow id, steps replayed, divergence points, and `finalStateMatch`. |
| `ContractViolation` | A violation with field name, expected and actual type, and the constraint violated (`required field missing` or `type mismatch`). |
| `ContractValidationResult` | Crossing id, `valid`, and the violations. |

## Examples

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

### Validating a Payload Against a Crossing Contract

```typescript
import { ContractAssertionEngine } from '@mmmnt/harness';

const contracts = new ContractAssertionEngine();

for (const flow of ir.flows) {
  for (const connection of flow.connections) {
    if (connection.connectionType !== 'crosses-to') continue;

    const payload = { holdId: 'h-1', amount: '12.00' }; // e.g. captured from your implementation
    const result = contracts.validate(connection.id, payload, connection.schemaContract);

    for (const v of result.violations) {
      console.log(`${result.crossingId} ${v.fieldName}: ${v.constraintViolated} ` +
        `(expected ${v.expected}, got ${v.actual})`);
    }
  }
}
```

A field's type matches when the payload value's JavaScript type (`typeof`, or `array`) equals the contract type in lower case.

## Integration

`@mmmnt/harness` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/harness
                                       |
                                       +-- @mmmnt/cli  (exposed via `moment test`)
```

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

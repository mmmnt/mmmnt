# @mmmnt/harness

Test execution engine that runs specification-derived tests against your domain implementations.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/harness.svg)](https://www.npmjs.com/package/@mmmnt/harness)

## Overview

`@mmmnt/harness` closes the loop between specification and implementation. While `@mmmnt/derive` generates test topologies and `@mmmnt/emit-ts` produces type contracts, this package actually executes those tests against your running code and reports whether the implementation conforms to the specification.

The test runner orchestrates test suite execution, managing setup, teardown, and result aggregation. The event replay engine replays recorded or simulated event sequences against aggregate implementations to verify state transitions. The contract assertion engine validates that your implementation's command handlers, event emitters, and projections conform to the type contracts and behavioral invariants defined in your `.moment` specification.

When tests fail, the harness produces structured divergence reports that pinpoint exactly where the implementation deviates from the specification, including the expected vs. actual payloads, missing events, and violated invariants.

## Installation

```bash
npm install @mmmnt/harness
```

## Quick Start

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TestRunner } from '@mmmnt/harness';

const parser = new MomentParser();
const { ast } = parser.parse('path/to/spec.moment');
const ir = astToIr(ast);
const topology = deriveTopology(ir);

const runner = new TestRunner();
const results = await runner.run(topology);

for (const result of results) {
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${result.testCase}`);
}
```

### Event Replay

```typescript
import { EventReplayEngine } from '@mmmnt/harness';

const engine = new EventReplayEngine();
const replayResult = await engine.replay({
  events: [
    { type: 'PatientRegistered', payload: { patientId: 'p-1', name: 'Jane' } },
    { type: 'AppointmentScheduled', payload: { patientId: 'p-1', date: '2026-04-10' } },
  ],
  aggregateFactory: () => new PatientAggregate(),
});

console.log(`Final state valid: ${replayResult.valid}`);
```

### Contract Assertions

```typescript
import { ContractAssertionEngine } from '@mmmnt/harness';

const contracts = new ContractAssertionEngine();
const validation = await contracts.validate({
  ir,
  implementationPath: './src/domain/',
});

for (const violation of validation.violations) {
  console.log(`${violation.severity}: ${violation.message} at ${violation.location}`);
}
```

## API Reference

| Export | Description |
|--------|-------------|
| `TestRunner` | Orchestrates test suite execution against implementations. Manages setup steps, runs assertions, and aggregates results. |
| `EventReplayEngine` | Replays event sequences against aggregate instances to verify state transition correctness. |
| `ContractAssertionEngine` | Validates implementation code against specification-defined type contracts and behavioral invariants. |

### Key Types

| Type | Description |
|------|-------------|
| `TestRunResult` | Aggregated result of a test suite run, including pass/fail counts and duration. |
| `DivergencePoint` | Location and details of where an implementation diverges from the specification. |
| `ReplayResult` | Result of an event replay, including final aggregate state and validity. |
| `ContractViolation` | A specific contract violation with severity, message, and source location. |
| `ContractValidationResult` | Aggregated result of contract validation across an implementation. |

## Integration

`@mmmnt/harness` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It works alongside:

- **@mmmnt/emit-ts** provides the generated type contracts that the harness validates against.
- **@mmmnt/generate** produces Gherkin scenarios that complement the harness's programmatic test execution.
- **@mmmnt/sync** uses harness results to inform drift detection and reconciliation decisions.
- **@mmmnt/cli** exposes test execution via the `moment test` command.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

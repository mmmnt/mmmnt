# @mmmnt/harness

Test execution engine with event replay and contract assertion for Moment-derived test suites.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/harness.svg)](https://www.npmjs.com/package/@mmmnt/harness)

## Overview

`@mmmnt/harness` closes the loop between specification and implementation. While `@mmmnt/derive` generates test topologies and `@mmmnt/emit-ts` produces type contracts, this package actually executes those tests against your running code and reports whether the implementation conforms to the specification.

The test runner orchestrates test suite execution, managing setup, teardown, and result aggregation. The event replay engine replays recorded or simulated event sequences against aggregate implementations to verify state transitions. The contract assertion engine validates that your implementation's command handlers, event emitters, and projections conform to the type contracts and behavioral invariants defined in your `.moment` specification.

When tests fail, the harness produces structured divergence reports that pinpoint exactly where the implementation deviates from the specification, including the expected vs. actual payloads, missing events, and violated invariants. These reports are machine-readable and can be consumed by CI/CD pipelines, the `@mmmnt/sync` drift detection engine, or presented directly to developers through the CLI.

## Installation

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

## Key Features

- **Test suite execution** -- orchestrates running derived test suites against your domain implementation, managing setup steps, teardown, and result aggregation.
- **Event replay engine** -- replays recorded or simulated event sequences against aggregate instances to verify that state transitions produce the correct final state.
- **Contract assertion engine** -- validates that implementation code conforms to the type contracts and behavioral invariants defined in the specification.
- **Structured divergence reports** -- when tests fail, produces machine-readable reports pinpointing exactly where the implementation deviates, with expected vs. actual payloads.
- **Aggregate factory support** -- supply your own aggregate factory functions to replay events against real implementations rather than stubs.
- **Severity-graded violations** -- contract violations are graded by severity (error, warning, info) so teams can prioritize fixes.
- **Source location tracking** -- violations include the source location in your implementation code for quick navigation.
- **CI/CD integration** -- structured output and standard exit codes make the harness suitable for automated pipeline gates.

## API Reference

### Test Execution

| Export | Description |
|--------|-------------|
| `TestRunner` | Orchestrates test suite execution against implementations. Manages setup steps, runs assertions, and aggregates results into `TestRunResult`. |

### Event Replay

| Export | Description |
|--------|-------------|
| `EventReplayEngine` | Replays event sequences against aggregate instances to verify state transition correctness. Accepts an aggregate factory and a list of events, returns `ReplayResult`. |

### Contract Validation

| Export | Description |
|--------|-------------|
| `ContractAssertionEngine` | Validates implementation code against specification-defined type contracts and behavioral invariants. Scans implementation files and reports `ContractViolation` entries. |

### Key Types

| Type | Description |
|------|-------------|
| `TestRunResult` | Aggregated result of a test suite run, including pass/fail counts, duration, and per-case details. |
| `DivergencePoint` | Location and details of where an implementation diverges from the specification, with expected and actual values. |
| `ReplayResult` | Result of an event replay, including final aggregate state, validity flag, and any divergence points. |
| `ContractViolation` | A specific contract violation with severity, message, rule name, and source location in the implementation. |
| `ContractValidationResult` | Aggregated result of contract validation across an implementation, with violation counts by severity. |

## Examples

### Running the Full Test Suite

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';
import { TestRunner } from '@mmmnt/harness';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);
const topology = deriveTopology(ir);

const runner = new TestRunner();
const results = await runner.run(topology);

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log(`Results: ${passed} passed, ${failed} failed`);

for (const result of results.filter(r => !r.passed)) {
  console.log(`\nFAILED: ${result.testCase}`);
  for (const divergence of result.divergences) {
    console.log(`  Expected: ${divergence.expected}`);
    console.log(`  Actual:   ${divergence.actual}`);
    console.log(`  At:       ${divergence.location}`);
  }
}
```

### Replaying Events Against an Aggregate

```typescript
import { EventReplayEngine } from '@mmmnt/harness';

const engine = new EventReplayEngine();

const replayResult = await engine.replay({
  events: [
    { type: 'PatientRegistered', payload: { patientId: 'p-1', name: 'Jane', species: 'canine' } },
    { type: 'AppointmentScheduled', payload: { patientId: 'p-1', date: '2026-04-10', vetId: 'v-1' } },
    { type: 'AppointmentCompleted', payload: { patientId: 'p-1', date: '2026-04-10', notes: 'Routine checkup' } },
  ],
  aggregateFactory: () => new PatientAggregate(),
});

console.log(`Final state valid: ${replayResult.valid}`);
if (!replayResult.valid) {
  for (const divergence of replayResult.divergences) {
    console.log(`Divergence at event ${divergence.eventIndex}: ${divergence.message}`);
  }
}
```

### Validating Implementation Contracts

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { ContractAssertionEngine } from '@mmmnt/harness';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const contracts = new ContractAssertionEngine();
const validation = await contracts.validate({
  ir,
  implementationPath: './src/domain/',
});

if (validation.violations.length === 0) {
  console.log('All contracts satisfied.');
} else {
  const errors = validation.violations.filter(v => v.severity === 'error');
  const warnings = validation.violations.filter(v => v.severity === 'warning');

  console.log(`Violations: ${errors.length} errors, ${warnings.length} warnings`);

  for (const violation of errors) {
    console.log(`  [ERROR] ${violation.message}`);
    console.log(`          at ${violation.location}`);
  }
}
```

## Integration

`@mmmnt/harness` depends on `@mmmnt/core` for the IR and `@mmmnt/derive` for test topologies. It works alongside several other packages:

```
@mmmnt/core --> @mmmnt/derive --> @mmmnt/harness
                                       |
                                       +-- @mmmnt/emit-ts   (provides generated type contracts)
                                       +-- @mmmnt/generate  (produces complementary Gherkin scenarios)
                                       +-- @mmmnt/sync      (uses harness results for drift decisions)
                                       +-- @mmmnt/cli       (exposed via `moment test`)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/harness
pnpm --filter @mmmnt/harness test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

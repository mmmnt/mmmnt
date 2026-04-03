# @mmmnt/derive

Derivation engine that generates test topologies, simulations, event catalogs, impact analysis, and saga state machines from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/derive.svg)](https://www.npmjs.com/package/@mmmnt/derive)

## Overview

`@mmmnt/derive` takes the Intermediate Representation produced by `@mmmnt/core` and derives a rich set of artifacts from it. Rather than writing test cases, simulation scenarios, or event catalogs by hand, this package generates them directly from your domain specification.

The derivation engine analyzes your bounded contexts, flows, and event relationships to produce test suite topologies with setup steps, assertion points, and payload validation. It generates simulation scenarios that exercise happy paths and edge cases, builds a complete event catalog documenting every event in your system, performs impact analysis to show how changes propagate across contexts, and extracts saga state machines from multi-step flows.

Negative scenario derivation automatically identifies failure modes, timeout conditions, and invariant violations that your specification implies but does not explicitly define, giving you broader test coverage without manual effort.

## Installation

```bash
npm install @mmmnt/derive
```

## Quick Start

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology, generateAllScenarios } from '@mmmnt/derive';

const parser = new MomentParser();
const { ast } = parser.parse('path/to/spec.moment');
const ir = astToIr(ast);

// Derive test topology
const topology = deriveTopology(ir);
console.log(`Test suites: ${topology.suites.length}`);
console.log(`Total test cases: ${topology.suites.flatMap(s => s.cases).length}`);

// Generate simulation scenarios
const scenarios = generateAllScenarios(ir);
for (const scenario of scenarios) {
  console.log(`Scenario: ${scenario.name} (${scenario.events.length} events)`);
}
```

### Event Catalog

```typescript
import { generateEventCatalog } from '@mmmnt/derive';

const catalog = generateEventCatalog(ir);
for (const entry of catalog.entries) {
  console.log(`${entry.eventName} — produced by: ${entry.producerContext}`);
}
```

### Impact Analysis

```typescript
import { generateImpactAnalysis } from '@mmmnt/derive';

const analysis = generateImpactAnalysis(ir);
for (const node of analysis.nodes) {
  console.log(`${node.name} impacts ${node.downstream.length} downstream nodes`);
}
```

### Saga State Machines

```typescript
import { generateSagaStateMachines } from '@mmmnt/derive';

const sagas = generateSagaStateMachines(ir);
for (const saga of sagas) {
  console.log(`Saga: ${saga.name} — ${saga.states.length} states, ${saga.transitions.length} transitions`);
}
```

## API Reference

### Derivation Engine

| Export | Description |
|--------|-------------|
| `deriveTopology(ir)` | Derives a complete test suite topology from the IR, including setup steps, assertion points, and payload constraints. |
| `generateSimulationScenario(ir, options?)` | Generates a single simulation scenario for a given flow or context. |
| `generateAllScenarios(ir)` | Generates simulation scenarios for every flow in the specification. |
| `deriveNegativeScenarios(ir)` | Derives failure-mode scenarios including timeouts, invariant violations, and missing preconditions. |
| `generateEventCatalog(ir)` | Builds a catalog of every event with producer/consumer context, payload schema, and flow participation. |
| `generateImpactAnalysis(ir)` | Produces a dependency graph showing how changes to one context or event propagate across the system. |
| `generateSagaStateMachines(ir)` | Extracts saga state machines from multi-step flows, with states and transitions. |

### Policies

| Export | Description |
|--------|-------------|
| `DeriveOnSpecificationParsed` | Policy that triggers derivation automatically when a specification is parsed. Accepts a `TopologyDerivedHook` callback. |

### Key Types

| Type | Description |
|------|-------------|
| `TestSuiteTopology` | Complete test topology with suites, metadata, and topology-level assertions. |
| `TestSuiteDefinition` | A single test suite with its test cases. |
| `TestCaseDefinition` | A test case with setup steps, assertion points, and payload validation. |
| `SimulationScenario` | A simulation run with ordered events and active branches. |
| `EventCatalog` / `EventCatalogEntry` | Catalog of events with producer/consumer metadata. |
| `ImpactAnalysis` / `ImpactNode` | Directed graph of impact propagation. |
| `SagaStateMachine` | State machine with states and transitions extracted from flows. |

## Integration

`@mmmnt/derive` depends on `@mmmnt/core` for the IR. Its output feeds into several downstream packages:

- **@mmmnt/emit-ts** uses the derived topology to generate test scaffold files.
- **@mmmnt/generate** uses the topology to produce Gherkin BDD scenarios.
- **@mmmnt/harness** executes the derived test cases against live implementations.
- **@mmmnt/cli** exposes derivation via the `moment derive` command.

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

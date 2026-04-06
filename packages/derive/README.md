# @mmmnt/derive

Test topology derivation, simulation scenarios, event catalogs, and impact analysis from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/derive.svg)](https://www.npmjs.com/package/@mmmnt/derive)

## Overview

`@mmmnt/derive` takes the Intermediate Representation produced by `@mmmnt/core` and derives a rich set of artifacts from it. Rather than writing test cases, simulation scenarios, or event catalogs by hand, this package generates them directly from your domain specification.

The derivation engine analyzes your bounded contexts, flows, and event relationships to produce test suite topologies with setup steps, assertion points, and payload validation. It generates simulation scenarios that exercise happy paths and edge cases, builds a complete event catalog documenting every event in your system, performs impact analysis to show how changes propagate across contexts, and extracts saga state machines from multi-step flows.

Negative scenario derivation automatically identifies failure modes, timeout conditions, and invariant violations that your specification implies but does not explicitly define, giving you broader test coverage without manual effort. This makes `@mmmnt/derive` particularly valuable for teams practicing event storming or domain-driven design, where the specification captures intent that translates directly into verifiable behavior.

## Installation

```bash
npm install @mmmnt/derive
```

Or with other package managers:

```bash
pnpm add @mmmnt/derive
yarn add @mmmnt/derive
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

## Key Features

- **Test topology derivation** -- produces complete test suite structures with setup steps, assertion points, and payload constraints derived from your specification.
- **Simulation scenario generation** -- creates execution scenarios for every flow, including happy paths and branching conditions.
- **Negative scenario derivation** -- automatically identifies failure modes, timeout conditions, missing preconditions, and invariant violations from the specification.
- **Event catalog generation** -- builds a complete catalog of every event with producer/consumer context, payload schema, and flow participation.
- **Impact analysis** -- produces a directed dependency graph showing how changes to one context or event propagate across the entire system.
- **Saga state machine extraction** -- derives state machines from multi-step flows, with explicit states and transitions.
- **Policy-driven automation** -- the `DeriveOnSpecificationParsed` policy triggers derivation automatically when a specification is parsed, enabling live development workflows.
- **Deterministic output** -- the same specification always produces the same derived artifacts, making output suitable for version control and diffing.

## API Reference

### Derivation Engine

| Export | Description |
|--------|-------------|
| `deriveTopology(ir)` | Derives a complete test suite topology from the IR, including setup steps, assertion points, and payload constraints. |
| `generateSimulationScenario(ir, options?)` | Generates a single simulation scenario for a given flow or context. Accepts `SimulationOptions` to control scope. |
| `generateAllScenarios(ir)` | Generates simulation scenarios for every flow in the specification. |
| `deriveNegativeScenarios(ir)` | Derives failure-mode scenarios including timeouts, invariant violations, and missing preconditions. |
| `generateEventCatalog(ir)` | Builds a catalog of every event with producer/consumer context, payload schema, and flow participation. |
| `generateImpactAnalysis(ir)` | Produces a dependency graph showing how changes to one context or event propagate across the system. |
| `generateSagaStateMachines(ir)` | Extracts saga state machines from multi-step flows, with states and transitions. |
| `TopologyEmitter` | Class that produces a `SimulationTopology` per flow, containing lanes, frames, connections, eventRouting, branchPredicates, and contextMap. |

### Policies

| Export | Description |
|--------|-------------|
| `DeriveOnSpecificationParsed` | Policy that triggers derivation automatically when a specification is parsed. Accepts a `TopologyDerivedHook` callback for downstream notification. |

### Key Types

| Type | Description |
|------|-------------|
| `TestSuiteTopology` | Complete test topology with suites, metadata, and topology-level assertions. |
| `TestSuiteDefinition` | A single test suite with its test cases, scoped to a context or flow. |
| `TestCaseDefinition` | A test case with setup steps, assertion points, and payload validation rules. |
| `SetupStep` | A precondition step required before a test case can execute. |
| `AssertionPoint` | An expected outcome to verify after a command or event. |
| `PayloadValidationStep` | A constraint on event or command payload fields. |
| `FieldConstraint` | A validation rule for a single field within a payload. |
| `TopologyMetadata` | Metadata about the derived topology including source specification and derivation timestamp. |
| `SimulationScenario` | A simulation run with ordered events and active branches. Includes `flowId: string` and `flowName: string` identifying the source flow. |
| `SimulationEvent` | A single event within a simulation scenario. |
| `ActiveBranch` | A branch condition active during a simulation. |
| `SimulationOptions` | Options controlling simulation scope and behavior. |
| `EventCatalog` / `EventCatalogEntry` | Catalog of events with producer/consumer metadata. |
| `ImpactAnalysis` / `ImpactNode` | Directed graph of impact propagation across contexts. |
| `SagaStateMachine` | State machine with states and transitions extracted from flows. Includes `earlyExitStates: readonly string[]` listing states from which the saga may exit early (any state that is neither initial nor final). |
| `SagaState` | A single state within a saga state machine. |
| `SagaTransition` | A transition between saga states, triggered by an event. |
| `SimulationTopology` | Complete topology for a single flow, produced by `TopologyEmitter`. Contains lanes, frames, connections, eventRouting, branchPredicates, and contextMap. |
| `TopologyLane` | A lane within a simulation topology, representing a bounded context or actor. |
| `TopologyFrame` | A frame grouping related nodes within a topology lane. |
| `TopologyNode` | A single node (command, event, or policy) within a topology frame. |
| `TopologyConnection` | A directed connection between two topology nodes. |
| `TopologyBranchPredicate` | A predicate describing a branching condition within the topology. |
| `TopologyContextMap` | A mapping of context relationships and dependencies within the topology. |
| `TopologySchemaContract` | A schema contract describing the payload shape exchanged between topology nodes. |

## Examples

### Deriving and Inspecting a Test Topology

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const topology = deriveTopology(ir);

for (const suite of topology.suites) {
  console.log(`Suite: ${suite.name}`);
  for (const testCase of suite.cases) {
    console.log(`  Case: ${testCase.name}`);
    console.log(`    Setup steps: ${testCase.setupSteps.length}`);
    console.log(`    Assertions: ${testCase.assertions.length}`);
    for (const assertion of testCase.assertions) {
      console.log(`      - ${assertion.description}`);
    }
  }
}
```

### Building an Event Catalog for Documentation

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { generateEventCatalog } from '@mmmnt/derive';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const catalog = generateEventCatalog(ir);

// Print a summary table
console.log('Event Name | Producer | Consumers | Fields');
console.log('-----------|----------|-----------|-------');
for (const entry of catalog.entries) {
  const consumers = entry.consumerContexts.join(', ') || '(none)';
  console.log(`${entry.eventName} | ${entry.producerContext} | ${consumers} | ${entry.fieldCount}`);
}
```

### Impact Analysis for Change Planning

```typescript
import { MomentParser, astToIr } from '@mmmnt/core';
import { generateImpactAnalysis } from '@mmmnt/derive';

const parser = new MomentParser();
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);

const analysis = generateImpactAnalysis(ir);

// Find high-impact nodes
const highImpact = analysis.nodes.filter(n => n.downstream.length > 2);
for (const node of highImpact) {
  console.log(`${node.name} impacts ${node.downstream.length} downstream nodes:`);
  for (const downstream of node.downstream) {
    console.log(`  -> ${downstream.name} (${downstream.type})`);
  }
}
```

### Automated Derivation with Policy

```typescript
import { MomentParser, astToIr, FileWatcher } from '@mmmnt/core';
import { DeriveOnSpecificationParsed } from '@mmmnt/derive';

const parser = new MomentParser();

const policy = new DeriveOnSpecificationParsed({
  onTopologyDerived: (topology) => {
    console.log(`Derived ${topology.suites.length} suites with ${topology.suites.flatMap(s => s.cases).length} test cases`);
  },
});

// Parse triggers derivation automatically
const { ast } = parser.parse('specs/vet-clinic.moment');
const ir = astToIr(ast);
await policy.handle(ir);
```

## Integration

`@mmmnt/derive` depends on `@mmmnt/core` for the IR. Its output feeds into several downstream packages:

```
@mmmnt/core
  |
  v
@mmmnt/derive
  |
  +-- @mmmnt/emit-ts     (uses topology for test scaffold generation)
  +-- @mmmnt/generate    (uses topology for Gherkin BDD scenarios)
  +-- @mmmnt/harness     (executes derived test cases against implementations)
  +-- @mmmnt/cli         (exposes derivation via `moment derive`)
  +-- @mmmnt/mcp         (exposes derivation via MCP tools)
```

## Contributing

This package is part of the [mmmnt monorepo](https://github.com/mmmnt/mmmnt). See the repository root for contribution guidelines, development setup, and the code of conduct.

```bash
git clone https://github.com/mmmnt/mmmnt.git
cd mmmnt
pnpm install
pnpm turbo build --filter=@mmmnt/derive
pnpm --filter @mmmnt/derive test
```

## License

[FSL-1.1-Apache-2.0](../../LICENSE.md)

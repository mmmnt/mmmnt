# @mmmnt/derive

Test topology derivation, simulation scenarios, event catalogs, and impact analysis from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/derive.svg)](https://www.npmjs.com/package/@mmmnt/derive)

## Overview

`@mmmnt/derive` takes the Intermediate Representation produced by `@mmmnt/core` and derives a rich set of artifacts from it. Rather than writing test cases, simulation scenarios, or event catalogs by hand, this package generates them directly from your domain specification.

The derivation engine analyzes your bounded contexts, flows, and event relationships to produce test suite topologies with setup steps, assertion points, and payload validation. It generates simulation scenarios for every branch path through a flow, builds an event catalog documenting every event in your system, performs impact analysis to show how changes propagate across contexts, and extracts saga state machines from the sagas your contexts declare.

Negative and timeout scenario derivation covers failure modes your specification implies but does not spell out as flows: commands whose preconditions are violated, and sagas whose declared timeout fires, giving you broader test coverage without manual effort. This makes `@mmmnt/derive` particularly valuable for teams practicing event storming or domain-driven design, where the specification captures intent that translates directly into verifiable behavior.

## Installation

Requires Node.js 22 or newer.

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
import { readFileSync } from 'node:fs';
import { MomentParser } from '@mmmnt/core';
import { deriveTopology, generateAllScenarios } from '@mmmnt/derive';

const path = 'path/to/spec.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;

// Derive test topology
const topology = deriveTopology(ir);
console.log(`Test suites: ${topology.suites.length}`);
console.log(`Total test cases: ${topology.suites.flatMap((s) => s.testCases).length}`);

// Generate simulation scenarios, one per distinct branch path of each flow
for (const flow of ir.flows) {
  for (const scenario of generateAllScenarios(ir, flow)) {
    console.log(`Scenario: ${scenario.scenarioLabel} (${scenario.events.length} events)`);
  }
}
```

### Project Mode

A model split across several `.moment` files is derived as one project: load the files with `ProjectLoader` from `@mmmnt/core` and pass the merged IR to any function in this package. The CLI does the same when given a directory (`moment derive <dir>`, `moment simulate <dir>`).

```typescript
import { ProjectLoader } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';

const project = await new ProjectLoader().loadProject([
  'model/contexts/memory.moment',
  'model/contexts/retrieval.moment',
  'model/flows/recall.moment',
]);
if (!project.success) throw new Error('The project has errors');

const topology = deriveTopology(project.ir);
```

## Key Features

- **Test topology derivation** -- produces one test suite per flow with test cases, setup steps, assertion points, and payload constraints derived from your specification.
- **Simulation scenario generation** -- creates a scenario for every distinct branch path through a flow, with events in the shared envelope shape. Steps that are not domain events carry their kind as a prefix: commands as `SimProcess.<Name>`, and read steps as `SimQuery.<Name>` and `SimProjection.<Name>`, so a query or projection is never simulated as a domain event.
- **Negative and timeout scenarios** -- derives precondition-violation scenarios for commands, and timeout (and compensation) scenarios for sagas that declare a timeout.
- **Event catalog generation** -- builds a catalog of every event with its producer, consumers, payload schema, and the moment it occurs in.
- **Impact analysis** -- produces a dependency graph of commands, events, policies, sagas, projections, queries, and context crossings. A projection depends on the events it folds; a query depends on the projections it reads.
- **Saga state machine extraction** -- derives a state machine for each declared saga, with states, transitions, compensation, timeout, and a reachability check.
- **Simulation topology** -- `TopologyEmitter` produces the per-flow drawing contract (lanes, frames, connections, routing); query and projection nodes are typed as such.
- **Policy definitions** -- `generatePolicyDefinitions` lists every policy with its trigger and the commands it chains to.
- **Policy-driven automation** -- the `DeriveOnSpecificationParsed` policy derives a topology from a parsed IR and passes it to registered hooks, so downstream generators can run as part of one pipeline.
- **Deterministic structure** -- the same specification produces the same derived structure; only the timestamps recorded in metadata vary, and `deriveTopology` accepts a fixed `derivedAt`.

## API Reference

### Derivation Engine

| Export | Description |
|--------|-------------|
| `deriveTopology(ir, derivedAt?)` | Derives a `TestSuiteTopology` from the IR: one suite per flow, with test cases, setup steps, assertion points, and payload constraints. |
| `generateSimulationScenario(ir, flow, options?)` | Generates a single simulation scenario for a flow. `SimulationOptions` selects branches and fixes the scenario id, session id, and base timestamp. |
| `generateAllScenarios(ir, flow, options?)` | Generates one scenario per distinct branch path through a flow. |
| `deriveNegativeScenarios(ir, flow, options?)` | Derives precondition-violation scenarios for the commands on a flow's path. |
| `deriveTimeoutScenarios(ir, flow, options?)` | Derives timeout scenarios for sagas that declare a timeout, including compensation when one is declared. |
| `generateEventCatalog(ir)` | Builds an `EventCatalog` of every event with its producer, consumers, payload schema, and temporal location. |
| `generateImpactAnalysis(ir)` | Produces an `ImpactAnalysis`: nodes for commands, events, policies, sagas, projections, queries, and crossings, each with `dependsOn` and `triggers` edges. |
| `generateSagaStateMachines(ir)` | Extracts a `SagaStateMachine` for each saga declared in a context. |
| `generatePolicyDefinitions(ir)` | Lists every policy as a `PolicyDefinitionArtifact` with its context, trigger, action, and chained commands. |
| `TopologyEmitter` | Class whose `emit(ir, flow)` produces a `SimulationTopology` containing lanes, frames, connections, eventRouting, branchPredicates, and contextMap. |

### Policies

| Export | Description |
|--------|-------------|
| `DeriveOnSpecificationParsed` | Policy whose `execute(ir)` derives a topology and passes it to every `TopologyDerivedHook` registered in `onTopologyDerived`. |

### Key Types

| Type | Description |
|------|-------------|
| `TestSuiteTopology` | Complete test topology with suites and metadata. |
| `TestSuiteDefinition` | A single test suite for one flow, with its test cases and the contexts it covers. |
| `TestCaseDefinition` | A test case for one moment, with setup steps and assertion points. |
| `SetupStep` | A precondition step required before a test case can execute. |
| `AssertionPoint` | An expected outcome to verify, typed as `payload`, `state`, `command`, `event`, `crossing`, `saga`, or `policy-chain`. |
| `PayloadValidationStep` | The expected fields of an event payload. |
| `FieldConstraint` | A validation rule for a single field within a payload. |
| `TopologyMetadata` | Hash of the source IR and the derivation timestamp. |
| `SimulationScenario` | A simulation run with its label, kind, Given/When/Then summary, expected path, active branches, and ordered events. Includes `flowId` and `flowName` identifying the source flow. |
| `ScenarioKind` | `happy`, `variant`, `failure`, `negative`, or `timeout`. |
| `SimulationEvent` | A single event within a simulation scenario, with causation and correlation ids. |
| `ActiveBranch` | A branch condition active during a simulation. |
| `SimulationOptions` | Options controlling branch selection and scenario identity. |
| `EventCatalog` / `EventCatalogEntry` | Catalog of events with producer/consumer metadata. |
| `ImpactAnalysis` / `ImpactNode` | Directed graph of impact propagation. Node types are `event`, `command`, `policy`, `saga`, `projection`, `query`, and `crossing`. |
| `SagaStateMachine` | State machine with initial and final states, transitions, compensation, timeout, and reachability. |
| `SagaState` | A single state within a saga state machine. |
| `SagaTransition` | A transition between saga states, with the event that fires it when the specification declares one. |
| `PolicyDefinitionArtifact` | A policy with its context id, trigger, optional action description, and chained commands. |
| `SimulationTopology` | Complete topology for a single flow, produced by `TopologyEmitter`. Contains lanes, frames, connections, eventRouting, branchPredicates, and contextMap. |
| `TopologyLane` | A lane within a simulation topology, representing a bounded context. |
| `TopologyFrame` | A frame for one moment, holding its nodes. |
| `TopologyNode` | A single node within a topology frame, typed by kind: command, event, policy, saga, query, or projection. |
| `TopologyConnection` | A directed connection between two topology nodes or frames. |
| `TopologyBranchPredicate` | A predicate describing a branching condition within the topology. |
| `TopologyContextMap` | The contexts and relationships that participate in the flow. |
| `TopologySchemaContract` | A schema contract describing the payload shape carried by a connection. |

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

### Deriving and Inspecting a Test Topology

```typescript
import { deriveTopology } from '@mmmnt/derive';

const topology = deriveTopology(ir);

for (const suite of topology.suites) {
  console.log(`Suite: ${suite.flowName}`);
  for (const testCase of suite.testCases) {
    console.log(`  Case: ${testCase.momentName}`);
    console.log(`    Setup steps: ${testCase.setupSteps.length}`);
    console.log(`    Assertions: ${testCase.assertions.length}`);
    for (const assertion of testCase.assertions) {
      console.log(`      - ${assertion.assertionType}: ${assertion.schemaContract.eventType}`);
    }
  }
}
```

### Building an Event Catalog for Documentation

```typescript
import { generateEventCatalog } from '@mmmnt/derive';

const catalog = generateEventCatalog(ir);

// Print a summary table
console.log('Event Name | Producer | Consumers | Fields');
console.log('-----------|----------|-----------|-------');
for (const entry of catalog.events) {
  const consumers = entry.consumers.map((c) => c.context).join(', ') || '(none)';
  console.log(
    `${entry.eventName} | ${entry.producer.context} | ${consumers} | ${entry.schema.fields.length}`,
  );
}
```

### Impact Analysis for Change Planning

```typescript
import { generateImpactAnalysis } from '@mmmnt/derive';

const analysis = generateImpactAnalysis(ir);

// Edges are node keys of the form `<type>:<context>:<name>`
const highImpact = analysis.nodes.filter((n) => n.triggers.length > 2);
for (const node of highImpact) {
  console.log(`${node.type} ${node.context}.${node.name} triggers ${node.triggers.length} nodes:`);
  for (const key of node.triggers) {
    console.log(`  -> ${key}`);
  }
}

// A query depends on the projections it reads; a projection on the events it folds
for (const query of analysis.nodes.filter((n) => n.type === 'query')) {
  console.log(`${query.name} reads ${query.dependsOn.join(', ')}`);
}
```

### Automated Derivation with Policy

```typescript
import { DeriveOnSpecificationParsed } from '@mmmnt/derive';

const policy = new DeriveOnSpecificationParsed({
  onTopologyDerived: [
    (topology) => {
      const cases = topology.suites.flatMap((s) => s.testCases).length;
      console.log(`Derived ${topology.suites.length} suites with ${cases} test cases`);
    },
  ],
});

const topology = await policy.execute(ir);
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
  +-- @mmmnt/generate    (uses topology for Cucumber JSON output)
  +-- @mmmnt/harness     (runs derived test suites as structural checks against the IR)
  +-- @mmmnt/cli         (exposes derivation via `moment derive` and `moment simulate`)
  +-- @mmmnt/mcp         (derives the topology for the `moment_emit_ts` tool)
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

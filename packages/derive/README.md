# @mmmnt/derive

Test topology derivation, simulation scenarios, event catalogs, and impact analysis from Moment specifications.

[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue.svg)](../../LICENSE.md)
[![npm version](https://img.shields.io/npm/v/@mmmnt/derive.svg)](https://www.npmjs.com/package/@mmmnt/derive)

## Overview

`@mmmnt/derive` reads the Intermediate Representation (IR) that `@mmmnt/core` produces and derives from it what a team would otherwise write by hand:

- a test topology: one suite per flow, with test cases, setup steps and assertion points
- simulation scenarios: one for every path through a flow, one for every precondition a placed command can fail, and one for every saga timeout
- an event catalog, an impact analysis, saga state machines and policy definitions
- a simulation topology per flow, the drawing and routing contract that Facet reads

The same model always derives the same structure. Only the timestamps recorded in metadata vary, and `deriveTopology` accepts a fixed one.

For the history of changes, see [CHANGELOG.md](CHANGELOG.md).

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
import {
  deriveTopology,
  generateAllScenarios,
  deriveNegativeScenarios,
  deriveTimeoutScenarios,
} from '@mmmnt/derive';

const path = 'examples/ticketwave/spec/ticketwave.moment';
const result = await new MomentParser().parseContent(readFileSync(path, 'utf-8'), path);
if (!result.success || !result.ir) throw new Error('The specification has errors');
const ir = result.ir;

// Derive the test topology
const topology = deriveTopology(ir);
console.log(`Test suites: ${topology.suites.length}`);
console.log(`Total test cases: ${topology.suites.flatMap((s) => s.testCases).length}`);

// Derive every scenario of one flow
const flow = ir.flows.find((f) => f.name === 'N5 - Seat request');
const scenarios = [
  ...generateAllScenarios(ir, flow),
  ...deriveNegativeScenarios(ir, flow),
  ...deriveTimeoutScenarios(ir, flow),
];
for (const s of scenarios) {
  console.log(`${s.kind.padEnd(8)} ${s.scenarioLabel} (${s.events.length} events)`);
}
```

Output for TicketWave:

```
Test suites: 8
Total test cases: 92
happy    Happy Path: N5 - Seat request (5 events)
variant  Variant: N5 - Seat request [sold-out] (5 events)
negative Failure: Requested quantity must be available in the pool not met (2 events)
negative Failure: Customer must not exceed maximum concurrent holds not met (2 events)
negative Failure: Customer must not already be on the waitlist for this tier not met (5 events)
```

Over all eight TicketWave flows the same three functions derive 72 scenarios: 8 happy, 4 variant, 10 failure, 48 negative and 2 timeout. `moment simulate <file> --all` derives the same set.

### Project Mode

A model split across several `.moment` files is derived as one project. `loadSpecification` from `@mmmnt/core` loads a single file, or every `.moment` file beneath a directory as one merged project. `ProjectLoader` loads an explicit list of files. Pass the IR to any function in this package. The CLI does the same when given a directory (`moment derive <dir>`, `moment simulate <dir>`).

```typescript
import { loadSpecification, ProjectLoader } from '@mmmnt/core';
import { deriveTopology } from '@mmmnt/derive';

// Every .moment file beneath a directory
const spec = await loadSpecification('examples/ticketwave/spec');
if (!spec.success || !spec.ir) throw new Error('The model has errors');
const topology = deriveTopology(spec.ir);

// Or an explicit list of files
const project = await new ProjectLoader().loadProject([
  'examples/ticketwave/spec/ticketwave.moment',
]);
if (!project.success) throw new Error('The project has errors');
const sameTopology = deriveTopology(project.ir);
```

## Scenario Kinds

Every scenario has a `kind`, which comes from the shape of the flow:

| Kind       | Label                                         | Derived from                                                                                                                                |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `happy`    | `Happy Path: <flow>`                          | the path that takes the first arm of every branch moment                                                                                    |
| `variant`  | `Variant: <flow> [<arms>]`                    | a path that takes another arm and ends at an `[outcome]` placement, or at no exit                                                           |
| `failure`  | `Failure Path: <flow> [<arms>]`               | a path whose selected arm ends at a `[terminal]` placement                                                                                  |
| `negative` | `Failure: <precondition description> not met` | a placed command and one of its preconditions. The scenario ends with `SimFailure.<Command>.PreconditionViolation`                          |
| `timeout`  | `Timeout: <flow> [<Saga>.<timeout>]`          | a saga that declares a timeout. It ends with `SimSaga.<Saga>.TimedOut`, then `SimSaga.<Saga>.Compensated` unless the compensation is `none` |

`generateAllScenarios` returns one `happy`, `variant` or `failure` scenario per distinct path. A path stops at a terminal or outcome placement, so a branch point after it is never expanded. Each `returns-to` loop is unrolled once.

`deriveNegativeScenarios` derives one scenario per (command, precondition, cause) in the flow, wherever the command is placed. It walks the first-arm path first, then every other path in the order `generateAllScenarios` enumerates them, and derives a refusal only the first time a path reaches it. The scenario holds the nodes up to and including the command, then the failure event. Pass `branchSelections` to walk one path only.

Preconditions of orchestration commands derive negatives too. A precondition scoped to a cause derives only in flows that place the command for that cause, and its failure event and `when` text name the cause.

## What a Scenario Contains

A scenario is a list of events in the shared envelope shape (`eventId`, `eventType`, `causationEventIds`, `correlationId`, `timestamp`, `payload` and the other fields of `SimulationEvent`). Each placed node becomes one event:

| Placed node | `eventType`            |
| ----------- | ---------------------- |
| command     | `SimProcess.<Command>` |
| query       | `SimQuery.<Query>`     |
| projection  | `SimProjection.<Name>` |
| event       | `<Event>`              |

Saga progress through mapped transitions is appended after the path events as `SimSaga.<Saga>.<State>`.

The payload carries the node's identity (`nodeId`, and `processName` for a command) and a sample value for every declared field:

- `UUID` fields sample `<name>-001`, strings `sample-<name>`, numbers and `Money` `0`, booleans `true`, value objects `{}`.
- A code set (`kind: "user" | "api"`) samples its first value. A map (`T{}`) samples `{}`. Of an exclusive group (`a: T | b: U`) only the first member is written.
- Fields of a crossing contract are added to the payload of the event that crosses.

**Branch arms.** Every event inside a selected arm carries the arm's condition in `payload.$branch` (exported as `BRANCH_KEY`). It also carries `payload.outcome` with the same value when the event declares no field named `outcome`. When it does, the event keeps its own sample value there, and the arm is read from `$branch` only. Events outside an arm carry neither key.

**Commands with several events.** A command declared `emits A, B` records both events in one transaction. When the flow places both after the command, each takes the command step as its cause and shares its timestamp; the second does not cite the first. A command with alternative outcomes (`emits A when Open | A, B when OneUseLeft`) shows the one outcome its flow places. When that outcome has a guard, the command step's payload carries `whenState` and the scenario's `when` text names the state. From TicketWave's N2 flow:

```
variant Variant: N2 - Presale access [last-use]
  when: The flow progresses through ...; RedeemAccessCode is invoked while AccessCode is OneUseLeft
    SimProcess.RedeemAccessCode   whenState: OneUseLeft
    AccessCodeRedeemed            causationEventIds: [evt-003]
    AccessCodeExhausted           causationEventIds: [evt-003]
```

**Policy conditions.** A policy may declare when it reacts (`trigger HoldReleased when reason = expired`). For a reaction the flow places (a command `triggered-by` the policy's trigger and named by its `chains-to`), the occurrence of the trigger that the reaction names carries the declared value. Every other occurrence keeps the usual sample value. A guard on the variant of a union field (`when decision.kind = Admitted`) sets `{ kind: "Admitted" }` on that occurrence, and another variant of the union on the other occurrences. An `after <Event>` condition needs no payload: the causation links already hold it.

## Other Artifacts

- **Test topology.** `deriveTopology` produces one suite per flow. Each moment becomes a test case with setup steps and assertion points (`payload`, `state`, `command`, `event`, `crossing`, `saga`, `policy-chain`). Saga and policy cases belong to the model, not to a flow, so each is assigned once, to the first flow that contains it.
- **Event catalog.** Every event with its producer, consumers, payload schema and the moment it occurs in. A process event names the orchestration that declares it (`producer.process`). For a command with several events, `producer.recordedWith` lists the other events of every outcome that contains the event, and `producer.alternativeTo` the events of the outcomes that do not. Both are absent for a single-event command.
- **Impact analysis.** A dependency graph of commands, events, policies, sagas, projections, queries and context crossings. A command links to every event of every outcome. A projection depends on the events it folds; a query depends on the projections it reads. A process event is attributed to its orchestration (`owner`).
- **Saga state machines.** One per declared saga, with states, transitions (with the event that fires each when the model maps one), compensation, timeout and a reachability check.
- **Policy definitions.** Every policy with its context, trigger, action and `chains-to` commands, and `condition` (`field`, `equals`, `after`) when the policy declares one.
- **Simulation topology.** `TopologyEmitter` produces the per-flow drawing contract: lanes, frames, connections, event routing, branch predicates and the context map. Query and projection nodes are typed as such. Frames carry the moment's notes, and nodes their cause. A connection declared inside a `when` arm carries the arm's condition as `branchCondition`: the same string that `branchPredicates[<frame>].routes` and a scenario's `activeBranches[].condition` use. Every branch predicate names `$branch` as its `field`.

## API Reference

### Derivation Engine

| Export                                           | Description                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deriveTopology(ir, derivedAt?)`                 | Derives a `TestSuiteTopology`: one suite per flow, with test cases, setup steps, assertion points and payload constraints.                                                 |
| `generateSimulationScenario(ir, flow, options?)` | Generates one scenario for a flow. `SimulationOptions` selects branches (`branchSelections`, moment name to arm) and fixes the scenario id, session id and base timestamp. |
| `generateAllScenarios(ir, flow, options?)`       | Generates one `happy`, `variant` or `failure` scenario per distinct path through a flow.                                                                                   |
| `deriveNegativeScenarios(ir, flow, options?)`    | Derives one `negative` scenario per (command, precondition, cause), over every path or over the one path `branchSelections` names.                                         |
| `deriveTimeoutScenarios(ir, flow, options?)`     | Derives a `timeout` scenario for each saga in the flow that declares a timeout, with compensation when one is declared.                                                    |
| `BRANCH_KEY`                                     | The payload key that holds the arm an event was derived in: `'$branch'`.                                                                                                   |
| `generateEventCatalog(ir)`                       | Builds an `EventCatalog`.                                                                                                                                                  |
| `generateImpactAnalysis(ir)`                     | Produces an `ImpactAnalysis`: nodes with `dependsOn` and `triggers` edges.                                                                                                 |
| `generateSagaStateMachines(ir)`                  | Extracts a `SagaStateMachine` for each saga declared in a context.                                                                                                         |
| `generatePolicyDefinitions(ir)`                  | Lists every policy as a `PolicyDefinitionArtifact`.                                                                                                                        |
| `TopologyEmitter`                                | Class whose `emit(ir, flow)` returns a `SimulationTopology`.                                                                                                               |

### Policies

| Export                        | Description                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeriveOnSpecificationParsed` | `new DeriveOnSpecificationParsed({ onTopologyDerived })`. Its `execute(ir)` derives a topology, calls every hook with `(topology, ir)`, and returns the topology. |

### Key Types

| Type                                 | Description                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TestSuiteTopology`                  | Suites and `metadata` (`sourceIrHash`, `derivedAt`).                                                                                                               |
| `TestSuiteDefinition`                | One suite: `flowId`, `flowName`, `testCases`, `contextsCovered`.                                                                                                   |
| `TestCaseDefinition`                 | A test case for one moment, with `setupSteps` and `assertions`.                                                                                                    |
| `SetupStep`                          | A step required before a test case can run.                                                                                                                        |
| `AssertionPoint`                     | An expected outcome, typed as `payload`, `state`, `command`, `event`, `crossing`, `saga` or `policy-chain`.                                                        |
| `PayloadValidationStep`              | The expected fields of an event payload.                                                                                                                           |
| `FieldConstraint`                    | A validation rule for one field of a payload.                                                                                                                      |
| `TopologyMetadata`                   | Hash of the source IR and the derivation timestamp.                                                                                                                |
| `SimulationScenario`                 | `scenarioId`, `flowId`, `flowName`, `scenarioLabel`, `kind`, `description`, `given`, `when`, `then`, `expectedPath`, `activeBranches` and ordered `events`.        |
| `ScenarioKind`                       | `happy`, `variant`, `failure`, `negative` or `timeout`.                                                                                                            |
| `SimulationEvent`                    | One event of a scenario, with causation and correlation ids and a payload.                                                                                         |
| `ActiveBranch`                       | An arm a scenario takes: `momentName`, `condition`, `routeChosen`.                                                                                                 |
| `SimulationOptions`                  | `scenarioId`, `branchSelections`, `sessionId`, `baseTimestamp`.                                                                                                    |
| `EventCatalog` / `EventCatalogEntry` | The catalog, and one event's entry: name, kind, schema, producer, consumers, temporal location.                                                                    |
| `ImpactAnalysis` / `ImpactNode`      | The impact graph. Node types are `event`, `command`, `policy`, `saga`, `projection`, `query` and `crossing`. Edges are keys of the form `<type>:<context>:<name>`. |
| `SagaStateMachine`                   | Initial and final states, states, transitions, compensation, timeout and reachability.                                                                             |
| `SagaState` / `SagaTransition`       | One state; one transition, with `onEvent` when the model maps one.                                                                                                 |
| `PolicyDefinitionArtifact`           | `name`, `contextId`, `trigger`, `actionDescription?`, `chainsTo`, `condition?`.                                                                                    |
| `DeriveOnSpecificationParsedOptions` | `{ onTopologyDerived?: TopologyDerivedHook[] }`.                                                                                                                   |
| `TopologyDerivedHook`                | `(topology, ir) => void \| Promise<void>`.                                                                                                                         |
| `SimulationTopology`                 | `name`, `flowId`, `version`, `lanes`, `frames`, `connections`, `eventRouting`, `branchPredicates`, `contextMap`.                                                   |
| `TopologyLane`                       | A lane, for a bounded context or a branch lane.                                                                                                                    |
| `TopologyFrame`                      | A frame for one moment, with its nodes and notes.                                                                                                                  |
| `TopologyNode`                       | A node, typed as command, event, policy, saga, query or projection, with its aggregate or process, its cause, and `optional` and `terminal` flags.                 |
| `TopologyConnection`                 | A directed connection between nodes or frames, with its `eventType`, crossing details, and `branchCondition` when it is declared inside an arm.                    |
| `TopologyBranchPredicate`            | `field` (`$branch`), `defaultRoute` and `routes` of a branch moment.                                                                                               |
| `TopologyContextMap`                 | The contexts and relationships that take part in the flow.                                                                                                         |
| `TopologySchemaContract`             | The required fields and field types a crossing carries.                                                                                                            |

## Examples

The examples below start from a parsed IR, obtained as in the Quick Start.

### Inspecting a Test Topology

```typescript
import { deriveTopology } from '@mmmnt/derive';

const topology = deriveTopology(ir);
const suite = topology.suites.find((s) => s.flowName === 'N4 - Event cancellation');

console.log(`Suite: ${suite.flowName} (${suite.contextsCovered.join(', ')})`);
for (const testCase of suite.testCases) {
  const assertions = testCase.assertions.map(
    (a) => `${a.assertionType}: ${a.schemaContract.eventType}`,
  );
  console.log(`  ${testCase.momentName}: ${assertions.join(', ') || 'no assertions'}`);
}
```

Output (excerpt):

```
Suite: N4 - Event cancellation (ctx-Catalog, ctx-Inventory, ctx-Delivery, ctx-Checkout, ctx-Notifications)
  Event cancellation: payload: EventCancelled
  Cancellation propagation to checkout: payload: EventCancelled
  ...
  Active holds release: no assertions
  ...
  policy NotifyOnEventCancelled chains EventCancelled → SendEventCancellationNotice: policy-chain: SendEventCancellationNotice
```

### Reading the Event Catalog

```typescript
import { generateEventCatalog } from '@mmmnt/derive';

const catalog = generateEventCatalog(ir);
console.log(`${catalog.metadata.totalEvents} events`);

for (const entry of catalog.events.filter((e) => e.eventName.startsWith('AccessCode'))) {
  const { command, recordedWith, alternativeTo } = entry.producer;
  const consumers = entry.consumers.map((c) => c.context).join(', ') || '(none)';
  console.log(`${entry.eventName} by ${command}, consumed by ${consumers}`);
  if (recordedWith) console.log(`  recorded with ${recordedWith.join(', ')}`);
  if (alternativeTo) console.log(`  alternative to ${alternativeTo.join(', ')}`);
}
```

Output:

```
96 events
AccessCodesGenerated by GenerateAccessCodes, consumed by (none)
AccessCodeRedeemed by RedeemAccessCode, consumed by (none)
  recorded with AccessCodeExhausted
AccessCodeExhausted by RedeemAccessCode, consumed by (none)
  recorded with AccessCodeRedeemed
  alternative to AccessCodeRedeemed
AccessCodeInvalidated by InvalidateAccessCode, consumed by (none)
```

`RedeemAccessCode` emits `AccessCodeRedeemed when Open | AccessCodeRedeemed, AccessCodeExhausted when OneUseLeft`. `AccessCodeExhausted` is recorded with `AccessCodeRedeemed` in the second outcome, and is an alternative to the first outcome, which holds `AccessCodeRedeemed` alone.

### Impact Analysis for Change Planning

```typescript
import { generateImpactAnalysis } from '@mmmnt/derive';

const analysis = generateImpactAnalysis(ir);

// Edges are node keys of the form `<type>:<context>:<name>`
const node = analysis.nodes.find((n) => n.type === 'event' && n.name === 'HoldReleased');
console.log(`${node.context}.${node.name} triggers:`);
for (const key of node.triggers) console.log(`  -> ${key}`);
console.log(`and depends on: ${node.dependsOn.join(', ')}`);
```

Output:

```
Inventory.HoldReleased triggers:
  -> policy:Inventory:ReplenishOnHoldRelease
  -> policy:Inventory:PromoteWaitlistOnRelease
  -> command:Presale:NotifyWaitlistPromotion
and depends on: command:Inventory:ReleaseHold
```

### Automated Derivation with a Policy

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
// Derived 8 suites with 92 test cases
```

## Integration

`@mmmnt/derive` depends on `@mmmnt/core` for the IR. These packages use it:

```
@mmmnt/core
  |
  v
@mmmnt/derive
  |
  +-- @mmmnt/emit-ts     (test scaffolds from the topology)
  +-- @mmmnt/generate    (Gherkin and Cucumber JSON from the topology)
  +-- @mmmnt/harness     (runs the derived suites as structural checks against the IR)
  +-- @mmmnt/cli         (`moment derive`, `moment simulate`, `moment serve`, and the commands above)
  +-- @mmmnt/mcp         (derives the topology for the `moment_emit_ts` tool)
```

`moment simulate <file|dir> --all --out-dir <dir>` writes what Facet loads: a `topology-<flow>.json` per flow, one JSON file per scenario, `manifest.json`, `event-catalog.json`, `impact-analysis.json`, `saga-state-machines.json`, `policy-definitions.json` and `asyncapi.yaml`. [`examples/ticketwave/facet`](../../examples/ticketwave/facet) holds them for TicketWave.

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

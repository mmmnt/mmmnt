# ADR-031: facet.json Output Contract — Simulation Scenario Generation and Event Lifecycle

Migrated from Confluence page 48791554 (version 1, last updated 2026-04-04), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/48791554. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Version:** 1.0
- **Date:** 2026-04-04
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/derive, @mmmnt/cli, @mmmnt/harness
- **Relates to:** [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) (Simulation Output Contracts), [ADR-029](ADR-029-moment-m6-output-changes-facet-integration-impact.md) (M6 Output Changes), [ADR-030](ADR-030-structural-validation-of-saga-and-policy-test-cases-in-the-test.md) (Saga/Policy Structural Validation)
- **Consumers:** Facet, any visualization consumer of Moment's simulation output

## Context

facet.json is the colloquial name for Moment's simulation scenario output — the JSON artifact produced by moment simulate --json. It is the primary data contract between Moment and Facet's Simulation Visualization pillar. This ADR comprehensively documents the file's generation pipeline, structure, event envelope format, and lifecycle.

Facet consumes facet.json to render interactive simulation surfaces: event timelines, causation chains, branch paths, saga state transitions, cross-context crossing contracts, and behavioral assertion overlays.

## 1. Generation Pipeline

### 1.1 How facet.json is Produced

```
.moment spec file
    │
    ▼
MomentParser.parseContent(content)        ← @mmmnt/core
    │
    ▼
astToIr(ast) → IntermediateRepresentation ← @mmmnt/core
    │
    ▼
generateAllScenarios(ir, flow)            ← @mmmnt/derive
    │   (one call per flow in the spec)
    ▼
SimulationScenario[]                      ← output
    │
    ▼
JSON.stringify → facet.json               ← @mmmnt/cli (moment simulate --json)
```

### 1.2 CLI Commands

Single flow (default — first flow or --flow named):

```
moment simulate spec.moment --json
# stdout: single SimulationScenario JSON object

moment simulate spec.moment --json --flow general-admission-purchase
# stdout: single SimulationScenario for the named flow
```

All flows:

The CLI calls generateAllScenarios(ir, flow) per flow. When --flow is omitted and the spec contains one flow, it outputs a single scenario object. When the spec contains multiple flows, it outputs an array.

### 1.3 Programmatic API

```
import { MomentParser } from '@mmmnt/core';
import { generateAllScenarios, generateSimulationScenario, deriveNegativeScenarios } from '@mmmnt/derive';

const parser = new MomentParser();
const result = await parser.parseContent(specContent);
const ir = result.ir;

// All scenarios for a flow (one per branch combination)
const scenarios: SimulationScenario[] = generateAllScenarios(ir, ir.flows[0]);

// Single scenario with specific branch selections
const scenario: SimulationScenario = generateSimulationScenario(ir, ir.flows[0], {
  branchSelections: { 'Hold risk decision': 'high-risk' },
});

// Negative scenarios (precondition violations)
const negatives: SimulationScenario[] = deriveNegativeScenarios(ir, ir.flows[0]);
```

## 2. File Structure — SimulationScenario

The top-level shape of facet.json. Each object represents one complete simulation path through a flow.

```
interface SimulationScenario {
  // --- Scenario Identity ---
  scenarioId: string;         // e.g., "scenario-flow-general-admission-purchase-0"
  scenarioLabel: string;      // e.g., "Happy Path: general-admission-purchase"
  description: string;        // Flow description from the .moment spec

  // --- Behavioral Assertions (GWT) ---
  given: string;              // Precondition narrative
  when: string;               // Action narrative (lists all moments traversed)
  then: string;               // Expected outcome narrative

  // --- Path Contract ---
  expectedPath: string[];     // Ordered node IDs the simulation should traverse
  activeBranches: ActiveBranch[];  // Branch decisions made for this scenario

  // --- Event Stream ---
  events: SimulationEvent[];  // Ordered PADR-004 compatible events with causation chains
}
```

### 2.1 Scenario Labeling Convention

| Pattern                                 | Meaning                                             | Example                                              |
| --------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Happy Path: {flowName}                  | All branch points select the first (default) branch | Happy Path: general-admission-purchase               |
| Failure Path: {flowName} [{conditions}] | At least one branch hits a terminal node            | Failure Path: general-admission-purchase [high-risk] |
| Variant: {flowName} [{conditions}]      | Non-default branches, none terminal                 | Variant: presale-access [window-expired]             |

### 2.2 Scenario Count

For a flow with N branch points, each with B(i) branches, the total scenario count is:

```
totalScenarios = B(1) × B(2) × ... × B(N)
```

A flow with no branches produces 1 scenario. The TicketWave general-admission-purchase flow (2 branch points: 3 × 2 = 6 scenarios) produces 6 scenarios.

## 3. ActiveBranch

Records which branch condition was selected at each decision point in this scenario.

```
interface ActiveBranch {
  momentName: string;    // The moment label, e.g., "Hold risk decision"
  condition: string;     // The when-block condition, e.g., "low-risk"
  routeChosen: string;   // Same as condition (for compatibility)
}
```

## 4. SimulationEvent — The Event Envelope

Every event in the events array conforms to the PADR-004 ComplaiEventEnvelope. This is the same envelope format used across the entire Complai platform (Sift, Moment, Facet).

```
interface SimulationEvent {
  // --- Identity ---
  eventId: string;              // Monotonic: "evt-001", "evt-002", ...
  eventType: string;            // See §4.1 for type conventions
  version: number;              // Always 1 (schema version)

  // --- Correlation ---
  sessionId: string;            // "sess-{scenarioId}" — ties all events in one simulation run
  correlationId: string;        // "corr-{scenarioId}" — same for all events in scenario
  causationEventIds: string[];  // Direct upstream cause(s) — see §4.3

  // --- Temporal ---
  timestamp: string;            // ISO 8601, 1-second spacing: "2026-01-01T10:00:00.000Z"

  // --- Source ---
  productSource: string;        // See §4.2

  // --- Data ---
  payload: Record<string, unknown>;  // See §4.4
}
```

### 4.1 eventType Conventions

Three eventType prefixes distinguish event categories:

| Prefix        | Meaning                                     | Example                                         | When generated                               |
| ------------- | ------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| (none)        | Domain event (from aggregate)               | EventPublished, SeatsHeld, PaymentConfirmed     | When the node is a defined event in the IR   |
| SimProcess.\* | Command execution                           | SimProcess.PublishEvent, SimProcess.RequestHold | When the node is a defined command in the IR |
| SimSaga.\*    | Saga state transition                       | SimSaga.SeatHoldLifecycle.Held                  | Injected after the saga's trigger event      |
| SimFailure.\* | Precondition violation (negative scenarios) | SimFailure.RequestHold.PreconditionViolation    | Only in negative scenarios                   |

Resolution logic (resolveEventType):

- Look up the node name in the IR context's aggregates

- If it's a defined command → SimProcess.{commandName}

- If it's a defined event → {eventName} (bare, no prefix)

- Otherwise → {nodeName} (fallback)

### 4.2 productSource Conventions

| Value                       | Meaning                                 | When used                                                                                                                        |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| {context-name} (kebab-case) | Event originated from a bounded context | Domain events with a matching event definition in the context. E.g., catalog, inventory, checkout                                |
| moment:simulation           | Synthetic simulation event              | Commands (SimProcess.\*), saga transitions (SimSaga.\*), failure events (SimFailure.\*), or events without a matching definition |

### 4.3 Causation Chain

Every event (except the first) has at least one entry in causationEventIds. The chain is built by:

- Explicit connections: If the flow has a triggered-by connection linking this node to a prior event, the prior event's ID is used

- Implicit ordering: If no explicit connection exists, the immediately preceding event's ID is used as the default cause

This produces a directed acyclic graph of causation — Facet uses this to render causation arrows and trace event provenance.

First event: causationEventIds: [] — the flow's initiating command has no upstream cause.

### 4.4 Payload Structure

Payloads are generated from the IR's field definitions with placeholder values.

Command payloads:

```
{
  "nodeId": "n02-RequestHold",
  "processName": "RequestHold",
  "eventId": "eventId-001",        // from input field: eventId: UUID
  "tierId": "tierId-001",          // from input field: tierId: UUID
  "quantity": 0,                    // from input field: quantity: number
  "customerId": "customerId-001",  // from input field: customerId: UUID
  "sessionId": "sessionId-001"     // from input field: sessionId: UUID
}
```

Domain event payloads:

```
{
  "nodeId": "n02-SeatsHeld",
  "holdId": "holdId-001",          // from event field: holdId: UUID
  "eventId": "eventId-001",        // from event field: eventId: UUID
  "tierId": "tierId-001",
  "quantity": 0,
  "customerId": "customerId-001",
  "expiresAt": "2026-01-01T10:00:00.000Z",
  "heldAt": "2026-01-01T10:00:00.000Z"
}
```

Saga transition payloads:

```
{
  "sagaName": "SeatHoldLifecycle",
  "state": "Held",
  "triggeredBy": "SeatsHeld"
}
```

Precondition violation payloads (negative scenarios):

```
{
  "nodeId": "n02-RequestHold",
  "failedPrecondition": "ticketsAvailable",
  "description": "Requested quantity must be available in the pool"
}
```

### 4.5 Placeholder Value Generation

| IR Type                       | Placeholder Value          | Example         |
| ----------------------------- | -------------------------- | --------------- |
| UUID                          | "{fieldName}-001"          | "holdId-001"    |
| string                        | "sample-{fieldName}"       | "sample-reason" |
| number                        | 0                          | 0               |
| boolean                       | true                       | true            |
| DateTime                      | "2026-01-01T10:00:00.000Z" | —               |
| Date                          | "2026-01-01"               | —               |
| Money                         | 0                          | 0               |
| {Type}[] (any array)          | []                         | []              |
| Any other type (value object) | {}                         | {}              |

## 5. Saga Event Injection

After the base event stream is generated, saga state transition events are injected inline. This is a post-processing pass that does not alter the original events — it inserts new events between existing ones.

### 5.1 Injection Logic

- Build a saga index: map each saga's trigger event name to its saga definition

- Walk the event stream sequentially

- When an event's eventType matches a saga trigger:

- Create a SimSaga.{sagaName}.{nextState} event

- Set its causationEventIds to [triggerEvent.eventId]

- Set its productSource to "moment:simulation"

- Insert it immediately after the trigger event

- Track saga progress — each subsequent trigger advances to the next state in the chain

### 5.2 Saga Event Shape

```
{
  eventId: "evt-034",                              // continues the counter
  eventType: "SimSaga.SeatHoldLifecycle.Held",     // SimSaga.{name}.{state}
  productSource: "moment:simulation",
  sessionId: "sess-scenario-flow-general-admission-purchase-0",
  causationEventIds: ["evt-006"],                  // the trigger event
  correlationId: "corr-scenario-flow-general-admission-purchase-0",
  timestamp: "2026-01-01T10:00:05.000Z",           // same as trigger event
  version: 1,
  payload: {
    sagaName: "SeatHoldLifecycle",
    state: "Held",
    triggeredBy: "SeatsHeld"
  }
}
```

### 5.3 Saga State Progression

For saga SeatHoldLifecycle with states Held -> Converting -> Converted -> Expired:

- First trigger: emits SimSaga.SeatHoldLifecycle.Held

- Second trigger: emits SimSaga.SeatHoldLifecycle.Converting

- Third trigger: emits SimSaga.SeatHoldLifecycle.Converted

- Fourth trigger: emits SimSaga.SeatHoldLifecycle.Expired

- Subsequent triggers: no event (saga exhausted)

## 6. Negative Scenarios

deriveNegativeScenarios(ir, flow) generates one scenario per command precondition in the flow. Each negative scenario replays the flow up to the failing command, then emits a SimFailure event.

### 6.1 Structure

The negative scenario has the same SimulationScenario shape but with:

- scenarioId: "{baseId}-neg-{commandName}-{preconditionName}"

- scenarioLabel: "Failure: {precondition description} not met"

- expectedPath: truncated at the failing command

- activeBranches: [] (no branch decisions — uses default path)

- events: all events up to and including the failing command, plus one SimFailure event

### 6.2 SimFailure Event

```
{
  eventId: "evt-005",
  eventType: "SimFailure.RequestHold.PreconditionViolation",
  productSource: "moment:simulation",
  sessionId: "...",
  causationEventIds: ["evt-004"],  // the last event before failure
  correlationId: "...",
  timestamp: "2026-01-01T10:00:04.000Z",
  version: 1,
  payload: {
    nodeId: "n02-RequestHold",
    failedPrecondition: "ticketsAvailable",
    description: "Requested quantity must be available in the pool"
  }
}
```

## 7. Node ID Convention

Every node in the expectedPath and every payload.nodeId follows the pattern:

```
n{momentIndex:2d}-{nodeName}
```

- momentIndex: zero-padded 2-digit index of the moment in the flow (e.g., 00, 01, 14)

- nodeName: the command or event name from the .moment spec (e.g., PublishEvent, SeatsHeld)

Examples: n00-PublishEvent, n02-SeatsHeld, n09-ConfirmPayment, n16-TicketDeliverySent

## 8. Terminal Branch Behavior

When a scenario selects a branch with a [terminal] node, the flow stops. No subsequent moments are processed. The expectedPath and events arrays are truncated at the terminal node.

Example: If Hold risk decision selects high-risk and that branch has botDetected: CustomerBlocked [terminal], the scenario ends there. No cart, no payment, no delivery.

## 9. Temporal Properties

| Property       | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| Base timestamp | 2026-01-01T10:00:00.000Z (configurable via SimulationOptions.baseTimestamp) |
| Event spacing  | 1 second between events                                                     |
| Saga events    | Same timestamp as their trigger event (no added delay)                      |
| Total duration | (eventCount - 1) seconds                                                    |

## 10. Example: TicketWave Output Summary

The TicketWave consumer example (7 contexts, 4 flows) produces:

| Flow                       | Branch Points | Scenarios | Events (happy path)        |
| -------------------------- | ------------- | --------- | -------------------------- |
| general-admission-purchase | 2 (3×2)       | 6         | 33 (includes 1 saga event) |
| presale-access             | 1 (3)         | 3         | 26                         |
| ticket-transfer            | 1 (3)         | 3         | 9                          |
| event-cancellation         | 1 (2)         | 2         | 15                         |
| Total                      |               | 14        |                            |

## 11. Importing facet.json in Facet

### 11.1 File Loading

Facet loads the scenario file alongside the topology:

```
public/simulations/
  ticketwave/
    topology.json              ← from moment viz --json (or TopologyEmitter)
    seeds/
      happy-path.seed.json     ← scenario metadata (no events per ADR-023)
    traces/
      happy-path.trace.json    ← SimulationTrace (events from facet.json)
```

Migration note (FACET-ADR-005): The current facet.json format includes events directly in the scenario object. [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) separates seeds (metadata only) from traces (events). During the transition period, Facet should accept both formats:

- Legacy: SimulationScenario with events[] field (current facet.json)

- [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md): SimulationSeed (no events) + SimulationTrace (events as steps)

### 11.2 Walker Saga Consumption

The walker saga in Facet's Redux store consumes events from the scenario:

```
// Legacy path (current facet.json)
const events = scenario.events;  // SimulationEvent[]

// ADR-023 path (future)
const steps = trace.steps;       // SimulationStepCompletedPayload[]
```

Both formats carry the same core data: eventId, eventType, causation chain, timestamp, payload. The [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) format adds sourceContextId, targetContextId, and assertionSource.

### 11.3 Event-to-Node Resolution

Facet resolves events to topology nodes via the eventRouting table in the topology:

```
const nodeIds = topology.eventRouting[event.eventType];
// e.g., "SeatsHeld" → ["n02-SeatsHeld"]
```

If no routing entry exists, Facet falls back to payload.nodeId.

### 11.4 Branch Predicate Evaluation

At branch nodes, Facet evaluates the branchPredicates from the topology against the event payload:

```
const predicate = topology.branchPredicates["n04"];
const fieldValue = event.payload[predicate.field];
const route = predicate.routes[fieldValue] ?? predicate.defaultRoute;
```

### 11.5 Assertion Points

Facet evaluates assertions at three tiers (FACET-ADR-003):

- Path assertion: scenario.expectedPath vs. actualPath built during walker replay

- Boundary crossing assertion: Events with crossBoundary: true connections checked for provenance

- Schema contract assertion: Event payloads validated against connection.schemaContract.requiredFields

## 12. Relationship to Other Moment Outputs

| Artifact           | CLI Command            | Relationship to facet.json                                                                                     |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| topology.json      | moment derive --json   | Test suite topology (suites, test cases, assertions) — the structural complement to facet.json's temporal data |
| viz.json           | moment viz             | VizDataEnvelope (context maps, timelines) — canvas layout, not simulation                                      |
| event-catalog.json | Programmatic only      | All domain events with producer/consumer metadata — reference data for facet.json's event types                |
| scenarios.json     | moment simulate --json | This IS facet.json — the simulation scenario output                                                            |
| specification.md   | moment generate        | Markdown documentation — no overlap                                                                            |
| asyncapi.yaml      | moment generate        | AsyncAPI spec for crossing events — API contract view of the same crossings facet.json simulates               |
| .feature files     | moment generate        | Gherkin scenarios — text-based BDD; facet.json is the executable simulation equivalent                         |

## 13. Determinism

The simulation output is fully deterministic: same .moment specification + same SimulationOptions always produces byte-identical output. There are no random values, no timestamps from Date.now(), no non-deterministic IDs.

| Input                   | Source of Determinism                                   |
| ----------------------- | ------------------------------------------------------- |
| Event IDs               | Monotonic counter: evt-001, evt-002, ...                |
| Timestamps              | Computed from baseTimestamp + (index × 1000ms)          |
| Session/Correlation IDs | Derived from scenarioId                                 |
| Payloads                | Placeholder values derived from field name + type       |
| Scenario order          | Cartesian product of branch conditions, stable ordering |
| Saga events             | Counter continues from base event count                 |

This determinism is critical for CI: facet.json can be committed to version control and diffed for regression detection.

## Version History

| Version | Date       | Changes                                                                                                    |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-04 | Initial comprehensive documentation of facet.json output contract, event lifecycle, and Facet import path. |

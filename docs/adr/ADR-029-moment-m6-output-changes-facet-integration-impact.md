# ADR-029: Moment M6 Output Changes — Facet Integration Impact

Migrated from Confluence page 48594946 (version 1, last updated 2026-04-04), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/48594946. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Version:** 1.0
- **Date:** 2026-04-03
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/derive, @mmmnt/core, @mmmnt/sync, @mmmnt/cli
- **Relates to:** [ADR-028](ADR-028-sift-import-bootstrap-jsonl-event-stream-architecture.md) (JSONL Event Stream), [ADR-022](ADR-022-cascade-execution-architecture.md) (Cascade Execution), [ADR-021](ADR-021-event-payload-contract.md) (Event Payload Contract)
- **Consumers:** Facet

## Context

Moment's M6 release (v0.1.0-m6) introduced significant changes to the output artifacts that Facet consumes. This ADR documents every breaking and additive change so the Facet team can update their consumers accordingly. Changes span milestones M3 through M6 since the last Facet integration point was pre-M3.

## 1. facet.json — Simulation Output Changes

### 1a. Saga Transition Events Injected

What changed: The simulation generator now injects saga state transition events into the event stream. The vet-clinic fixture produces 29 events (was 28).

New event format:

```
{
  "eventId": "evt-029",
  "eventType": "SimSaga.VisitLifecycle.Triaging",
  "productSource": "moment:simulation",
  "sessionId": "sess-scenario-flow-scheduled-visit-happy-path",
  "causationEventIds": ["evt-003"],
  "correlationId": "corr-scenario-flow-scheduled-visit-happy-path",
  "timestamp": "2026-01-01T10:00:28.000Z",
  "version": 1,
  "payload": {}
}
```

Facet impact: Facet's event consumer must handle SimSaga.\* event types. These events have productSource: "moment:simulation" (not a context name). They appear between the trigger event and the next command event in the timeline.

### 1b. Multi-Scenario Generation

What changed: generateAllScenarios() now produces all path combinations from branch points. The vet-clinic fixture generates 8 scenarios:

- 1 Happy Path (all first-branch selections)

- 7 Failure Paths (combinations of terminal branch selections)

New fields on SimulationScenario:

- scenarioLabel now varies: "Happy Path: ...", "Failure Path: ... [conditions]", "Variant: ... [conditions]"

- activeBranches[] lists which branch condition was selected at each decision point

Facet impact: Facet should render all scenarios, not just the first one. Failure paths have fewer events (terminal branches stop the flow early).

### 1c. Negative Scenarios

What changed: deriveNegativeScenarios() generates one scenario per precondition violation. The vet-clinic fixture produces 8 negative scenarios (one per command precondition).

Negative scenario format:

```
{
  "scenarioLabel": "Failure: Patient must have a scheduled appointment not met",
  "events": [ /* events up to the failing command, then a failure event */ ]
}
```

Facet impact: These are separate from the path scenarios. Facet can render them as "what-if" failure cases.

## 2. FieldDefinition — Deprecation Metadata

### 2a. IR Type Change

What changed: FieldDefinition in @mmmnt/core now has an optional deprecated property:

```
interface FieldDefinition {
  name: string;
  type: string;
  isArray: boolean;
  required: boolean;
  deprecated?: { reason: string; replacement: string };  // NEW
}
```

DSL syntax:

```
event PatientCheckedIn
  ownerName: string [deprecated "Use ownerRef composite key" -> "ownerRef"]
  ownerRef: UUID
```

### 2b. Impact on Generated Artifacts

| Artifact          | How Deprecation Appears                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| TypeScript types  | /\*\* @deprecated Use ownerRef composite key (use ownerRef instead) \*/ JSDoc on property |
| AsyncAPI YAML     | deprecated: true on property schema (only for crossing events)                            |
| Specification doc | ~~ownerName~~ (deprecated) with strikethrough                                             |
| Event catalog     | deprecated: { reason, replacement } in field metadata                                     |
| Gherkin           | No change (fields not rendered in scenarios)                                              |
| facet.json        | Deprecated fields still appear in event payloads with placeholder values                  |

Facet impact: If Facet renders event field tables or schema views, it should check field.deprecated and show a visual indicator. The deprecated field's replacement should be displayed as a migration hint.

## 3. New Artifacts Available

### 3a. event-catalog.json

Structure:

```
{
  "events": [
    {
      "eventName": "PatientCheckedIn",
      "schema": {
        "fields": [
          { "name": "ownerName", "type": "string", "isArray": false, "deprecated": { "reason": "...", "replacement": "ownerRef" } },
          { "name": "ownerRef", "type": "UUID", "isArray": false }
        ]
      },
      "producer": { "context": "Reception", "aggregate": "PatientIntake", "command": "CheckInPatient" },
      "consumers": [{ "context": "Clinical", "relationshipType": "crosses-to" }],
      "temporalLocation": { "moment": "Patient check-in", "momentIndex": 0 }
    }
  ],
  "metadata": { "generatedAt": "...", "totalEvents": 14 }
}
```

Facet impact: Facet can use this for event lineage views — who produces each event, who consumes it, where it sits in the temporal flow.

### 3b. impact-analysis.json

Structure:

```
{
  "nodes": [
    {
      "type": "command",
      "name": "CheckInPatient",
      "context": "Reception",
      "dependsOn": [],
      "triggers": ["PatientCheckedIn"]
    },
    {
      "type": "event",
      "name": "PatientCheckedIn",
      "context": "Reception",
      "dependsOn": ["CheckInPatient"],
      "triggers": []
    },
    {
      "type": "policy",
      "name": "TriageOnIntakeRegistered",
      "context": "Clinical",
      "dependsOn": ["PatientIntakeRegistered"],
      "triggers": ["CompleteTriage"]
    }
  ],
  "metadata": { "generatedAt": "..." }
}
```

Node types: command, event, policy, saga, crossing

Facet impact: Facet can render this as a dependency graph — change impact visualization showing what's affected when a command or event changes.

### 3c. saga-state-machine.json

Structure:

```
[
  {
    "sagaName": "VisitLifecycle",
    "context": "Clinical",
    "initialState": "Triaging",
    "finalState": "Complete",
    "states": [
      { "name": "Triaging", "isInitial": true, "isFinal": false },
      { "name": "Diagnosing", "isInitial": false, "isFinal": false },
      { "name": "Complete", "isInitial": false, "isFinal": true }
    ],
    "transitions": [
      { "from": "Triaging", "to": "Diagnosing" },
      { "from": "Diagnosing", "to": "Cataloging" }
    ],
    "compensation": "Cancel visit and release appointment slot",
    "timeout": "visitTimeout",
    "reachability": { "allReachable": true, "unreachableStates": [] }
  }
]
```

Facet impact: Facet can render saga state machine diagrams with transition arrows, initial/final markers, and compensation actions.

### 3d. asyncapi.yaml

AsyncAPI 3.0 specification generated from crossing contracts. Contains channels for each crossing event with message schemas.

Facet impact: Facet can render API contract views for event-driven integrations between bounded contexts.

## 4. JSONL Event Stream Format (ADR-028)

### 4a. Sift Published Language Events

Moment now reads Sift output as JSONL files in .domain/ — one file per bounded context. Each line is a ComplaiEventEnvelope:

```
{"eventId":"evt-001","eventType":"BoundedContextDefined","version":1,"productSource":"sift","sessionId":"ses_system_sift_analysis","causationEventIds":[],"correlationId":"corr-001","timestamp":"2026-04-01T10:00:00.000Z","payload":{"contextName":"Ordering","classification":"Core"}}
```

8 event types:

- BoundedContextDefined — { contextName, classification? }

- AggregateAdded — { contextName, aggregateName, identityField }

- CommandDefined — { contextName, aggregateName, commandName, inputs[], emitsEvent, preconditions? }

- EventDefined — { contextName, aggregateName, eventName, fields[] }

- ValueObjectDefined — { contextName, aggregateName, voName, fields[] }

- InvariantDefined — { contextName, invariantId, description, scope }

- PolicyDefined — { contextName, policyName, trigger, action, chainsTo? }

- SagaDefined — { contextName, sagaName, trigger, states[], compensation, timeout }

Facet impact: If Facet needs to consume Sift output directly, it should use the same JSONL format and event types. The SiftEventStreamReader in @mmmnt/sync can be used as a reference implementation.

### 4b. Two Bootstrap Paths

- Path A (file-based, no account): Sift pushes to git → .domain/\*.jsonl on disk → Moment imports

- Path B (Kafka, future): Stream replay from Kafka → requires Complai account

Facet impact: Facet should plan to consume the same .domain/\*.jsonl format if it needs to read Sift specifications directly.

## 5. Outbound Event Signals

### 5a. MomentReconcileCompleted

Moment now writes local event signals to .complai/events/moment/\*.jsonl after reconciliation:

```
{
  "eventId": "evt-reconcile-1712136000000",
  "eventType": "MomentReconcileCompleted",
  "version": 1,
  "productSource": "moment",
  "sessionId": "ses_local_cli",
  "causationEventIds": [],
  "correlationId": "corr-reconcile-1712136000000",
  "timestamp": "2026-04-03T12:00:00.000Z",
  "payload": {
    "reconcileResult": "APPLIED",
    "cascadeCategory": 1
  }
}
```

Reconcile outcomes:

- APPLIED (Category 1) — deterministic updates applied

- DRIFT (Category 2) — structural drift, review needed

- BREAKING (Category 3) — breaking changes, manual resolution

Facet impact: Facet can poll .complai/events/moment/ or use the MCP moment_get_events tool to detect when Moment has reconciled changes. This enables Facet to trigger its own re-render or update cycle.

## 6. derive-topology.json — Clean Context List

### 6a. Phantom Contexts Removed

What changed: contextsCovered no longer includes terminal branch lane IDs (ctx-Intake Failure, ctx-Vet Disagreement, ctx-Records Incomplete). Only real bounded contexts appear: ['ctx-Reception', 'ctx-Clinical', 'ctx-Billing', 'ctx-Records'].

Facet impact: If Facet was reading contextsCovered to build a context list, it now gets a clean list without phantom entries. No filtering needed.

## 7. MCP Server — AI Agent Integration

### 7a. 7 Tools Available

Facet's AI agent integration can use the MCP server:

| Tool              | Use Case for Facet                                          |
| ----------------- | ----------------------------------------------------------- |
| moment_validate   | Check if a .moment file is valid before rendering           |
| moment_status     | Get unified project health (parse, drift, schema, upstream) |
| moment_viz        | Get VizDataEnvelope for context maps and timelines          |
| moment_get_events | Poll for reconciliation completion events                   |
| moment_import     | Trigger Sift import programmatically                        |
| moment_emit_ts    | Generate TypeScript on demand                               |
| moment_reconcile  | Trigger cascade reconciliation                              |

Facet impact: Facet's AI features can call these tools instead of shelling out to the CLI.

## Consequences

For Facet consumers:

- Update event stream parser to handle SimSaga.\* event types in facet.json

- Handle deprecated field on FieldDefinition in any field rendering

- Consider consuming new artifacts (event-catalog, impact-analysis, saga-state-machine) for richer views

- Plan for .complai/events/moment/ polling if live update detection is needed

- Remove any hardcoded context filtering for phantom branch lanes

No breaking changes to existing Facet consumers if they ignore unknown event types and unknown fields. All changes are additive except the saga event injection (which changes event count and introduces new event types in the stream).

## Version History

| Version | Date       | Changes                                                                            |
| ------- | ---------- | ---------------------------------------------------------------------------------- |
| 1.0     | 2026-04-03 | Initial publication. Documents all M3-M6 output changes impacting Facet consumers. |

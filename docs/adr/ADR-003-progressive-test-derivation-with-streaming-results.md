# ADR-003: Progressive Test Derivation with Streaming Results

Migrated from Confluence page 11730947 (version 2, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/11730947. The Confluence space is private; this file is now the record.

Migrated from Sift: This ADR originated as Sift ADR-037. Migrated to the Moment space March 2026 when the Moment Specification Language was established as an independent project.

- **Status:** Proposed
- **Release:** R6
- **Date:** 2026-03-06
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Sift Origin:** ADR-037
- **Tags:** client-app:spec-view

## Context

[ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) introduced MomentProjectionView — a live projection that materializes Moment DSL constructs from pipeline events as they flow through Sift's bounded contexts. Each ProjectedMoment in the projection carries a payload snapshot of the event that produced it.

[ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) defines a complete BDD Derivation Manifest: 18 DSL constructs mapped to test output, 11 manifest entry kinds dispatched to assertion shapes, 4 relationship types with contract structures, and 17 validation rules. However, [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md)'s derivation model is batch — it assumes a complete, static moment spec as input and produces a complete test suite as output.

The gap: as the moment projection materializes progressively ([ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md)), the derivation engine should produce test cases progressively too. The architect should see test results streaming into the UI as Sift's pipeline processes input — not after the full pipeline completes. Each event payload that arrives can be validated against the expected schema from the Event Manifest ([ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md)), catching specification errors in flight rather than discovering them after the fact.

Additionally, Sift ADR-022 established a WebSocket connection between Sift and the architect's UI with seven server→client frame types. Streaming derivation results to the architect requires extending this protocol.

## Decision

### 1. Per-Phase Derivation Trigger

The derivation engine does not fire per-moment. It fires at phase boundaries — domain events that signal the completion of a pipeline phase. When a phase boundary event arrives, the derivation engine derives all test cases for every moment in that phase as a single batch.

Phase boundary events:

| Phase                    | Boundary Event                   | Moments Derived                                                               |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------------------- |
| Document Entry           | InputSourceRegistered            | Input source registration moment only                                         |
| Normalization            | NormalizationCompleted           | All extraction, classification, fingerprinting, and batch boundary moments    |
| Normalization (failure)  | InputProcessingStalled           | All moments up to and including the stall, plus terminal assertions           |
| Normalization (coaching) | InputSufficiencyFailed           | All moments up to sufficiency check, plus coaching branch entry               |
| Specification Generation | InterpretationCompleted          | All interpretation moments — pass start, candidate emissions, pass completion |
| Analysis                 | StructuralAnalysisCompleted      | Gap identification moments                                                    |
| Refinement Decision      | CandidateConfirmed / GapResolved | Per-decision: the specific confirmation or resolution moment                  |

Why per-phase, not per-moment: Per-moment derivation would fire for every ConceptStatementExtracted event during normalization — potentially dozens of times for a single document. This creates noise: the architect sees rapid-fire green flickers for low-value intra-phase moments before anything meaningful happens at the boundary crossing. Per-phase batching waits for the domain-significant boundary event and then presents the complete phase result as a coherent unit.

Exception — Refinement decisions: CandidateConfirmed, CandidateOverridden, CandidateRejected, and GapResolved are individually significant architect actions. These trigger immediate derivation for their single moment rather than waiting for a phase boundary. The architect acts, the derivation responds.

### 2. Derivation Engine as MomentProjectionView Subscriber

The derivation engine subscribes to MomentProjectionView updates, not to raw pipeline events. When the moment projection materializes a phase boundary moment (identified by the sourceEventType field on ProjectedMoment), the derivation engine:

- Queries MomentProjectionView for all moments in the completed phase (filtered by phase and pipelineRunId)

- For each moment, resolves the corresponding ManifestEntry from the Event Manifest ([ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md))

- Applies [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md)'s derivation rules to generate test case metadata

- Validates the moment's payload snapshot against the manifest's expected schema

- Persists the derivation result

- Streams the batch result to the UI via the WebSocket derivation frame

This keeps the derivation engine decoupled from the pipeline topology. It doesn't need to know which Kafka topics carry which events. It only needs to know "the moment projection updated."

### 3. Schema-as-Contract Validation

Each ProjectedMoment carries a payload: Record\<string, unknown> snapshot ([ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) §7). The derivation engine validates this payload against the expected schema from the Event Manifest.

Three validation outcomes:

| Outcome         | Condition                                                             | Effect                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass            | Payload conforms to manifest schema                                   | Derived test case status: passing. Green in the UI.                                                                                                       |
| Schema mismatch | Payload does not conform to manifest schema                           | Derived test case status: failing. GapIdentified emitted with ruleId: "moment.schema-mismatch", category: "structural", severity: "error". Red in the UI. |
| Missing moment  | Authored moment spec declares a moment not yet observed in projection | Derived test case status: pending. Sourced from MomentReconciliationView's "expected, not observed" signal. Gray in the UI.                               |

Schema mismatch → GapIdentified: When a payload doesn't match the manifest schema, the derivation engine emits a GapIdentified event through the existing structural analysis path. The gap carries:

- ruleId: "moment.schema-mismatch"

- category: "structural"

- severity: "error"

- diagnostic: "Event [eventType] payload does not conform to manifest schema. Field [fieldName]: expected [expectedType], received [actualType]."

- surfacedBy: "moment-derivation"

This connects progressive derivation to the architect's existing gap inventory. Schema mismatches appear alongside other structural gaps and are resolved through the same refinement flow.

### 4. Crossing Contract Validation

When a ProjectedCrossing ([ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) §4) is associated with derived moments in a completed phase, the derivation engine also validates the crossing contract:

- Resolved crossing: The derivation engine generates relationship-specific contract assertions per [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) §4 (Partnership, Customer-Supplier, Conformist, OHS/Published Language). Contract test status is determined by whether the crossing event's payload satisfies the relationship-specific obligations.

- Unresolved crossing: The derivation engine generates a contract test with status unresolved. No schema validation is performed because the contract shape depends on the relationship type. GapIdentified emitted with ruleId: "moment.unresolved-crossing", category: "structural", severity: "warning".

### 5. Derivation Result Schema

```
interface DerivationBatch {
  batchId: string;              // Deterministic from pipelineRunId + phase
  specificationId: string;
  pipelineRunId: string;
  phase: string;                // Phase that completed
  boundaryEventType: string;    // e.g., "NormalizationCompleted"
  derivedAt: string;            // ISO timestamp
  testCases: DerivedTestCase[];
  contractTests: DerivedContractTest[];
  summary: DerivationSummary;
}

interface DerivedTestCase {
  testCaseId: string;           // Deterministic from momentId + manifestEntryId
  momentId: string;             // Links to ProjectedMoment
  manifestEntryId: string;      // Links to ManifestEntry
  manifestEntryKind: string;    // e.g., "event", "sagaEvent", "command"
  context: string;              // Bounded context
  label: string;                // Human-readable test description
  status: "passing" | "failing" | "pending" | "stale";
  validationDetail?: SchemaValidationDetail;
  gapId?: string;               // If status is "failing", links to GapIdentified
}

interface DerivedContractTest {
  contractTestId: string;       // Deterministic from crossingId + relationship
  crossingId: string;           // Links to ProjectedCrossing
  sourceContext: string;
  targetContext: string;
  relationshipType: string | "unresolved";
  status: "passing" | "failing" | "unresolved" | "stale";
  obligations: ContractObligation[];
  gapId?: string;
}

interface ContractObligation {
  description: string;          // e.g., "carries inputQuality field for interpretation routing"
  satisfied: boolean;
}

interface SchemaValidationDetail {
  fieldPath: string;
  expected: string;
  received: string;
  zodError?: string;            // Raw Zod validation error for diagnostics
}

interface DerivationSummary {
  totalTestCases: number;
  passing: number;
  failing: number;
  pending: number;
  stale: number;
  totalContractTests: number;
  contractsPassing: number;
  contractsFailing: number;
  contractsUnresolved: number;
}
```

### 6. Cumulative Test Lifecycle

Derived test cases persist in DynamoDB alongside the projected moments they derive from. The test lifecycle mirrors the moment lifecycle ([ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) §5):

| Moment State | Derived Test State | Meaning                                                      |
| ------------ | ------------------ | ------------------------------------------------------------ |
| observed     | passing or failing | First derivation — schema validated against payload          |
| confirmed    | passing or failing | Consistent result across multiple pipeline runs              |
| stale        | stale              | Moment didn't appear in latest run — derived test also stale |

When a moment transitions to stale, its derived test cases automatically transition to stale. When a stale moment is re-observed (appears in a new pipeline run), its derived tests are re-validated and transition back to passing or failing.

The pipelineRunId on each DerivationBatch enables run-over-run comparison: "these 12 tests were passing in run 1 and run 2, but this test started failing in run 3."

### 7. DynamoDB Persistence

Derivation results are persisted in the existing sift-projections-moment DynamoDB table ([ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) §8), extending the partition scheme:

| PK                     | SK                        | Attributes                                           |
| ---------------------- | ------------------------- | ---------------------------------------------------- |
| SPEC#{specificationId} | BATCH#{batchId}           | All DerivationBatch fields (excluding nested arrays) |
| SPEC#{specificationId} | TEST#{testCaseId}         | All DerivedTestCase fields                           |
| SPEC#{specificationId} | CONTRACT#{contractTestId} | All DerivedContractTest fields                       |

GSI-status: PK: status, SK: derivedAt — enables "show me all failing tests" queries.

No new DynamoDB tables. The derivation results colocate with the moment projection they derive from.

### 8. WebSocket derivation Frame Type

A new derivation frame type is added to the Sift ADR-022 WebSocket protocol (8th frame type). When a derivation batch completes, the sift-worker-doc-projection Lambda posts a derivation frame to the architect's active WebSocket connection via the Management API pattern (POST /@connections/{connectionId}).

Frame schema:

```
interface DerivationFrame {
  type: "derivation";
  batchId: string;
  phase: string;
  summary: DerivationSummary;
  testCases: DerivedTestCase[];     // Full test case details for the phase
  contractTests: DerivedContractTest[];
}
```

Delivery semantics:

- Derivation frames are delivered only during an active refinement session with an open WebSocket connection

- If no WebSocket connection is active, the derivation result is persisted to DynamoDB and available via API on the next session resumption

- Derivation frames are informational — they do not require acknowledgment from the client

- Multiple derivation frames may arrive in rapid succession if multiple phases complete close together (e.g., Document Entry followed immediately by Normalization for a well-formed document)

Frame type inventory update (Sift ADR-022 cascade):

| Frame Type        | Direction     | Purpose                      |
| ----------------- | ------------- | ---------------------------- |
| ack               | Server→Client | Turn received                |
| token             | Server→Client | Streaming token              |
| response          | Server→Client | Turn complete                |
| event             | Server→Client | Domain event notification    |
| clarification     | Server→Client | Ambiguous intent — question  |
| compound_complete | Server→Client | All segments processed       |
| error             | Server→Client | Error notification           |
| derivation        | Server→Client | Test derivation batch result |

### 9. Package: @complai/bdd-derivation

The derivation engine is packaged as @complai/bdd-derivation in the monorepo's packages/ directory. This package owns:

- DSL parser: Moment DSL grammar → MomentData IR (from [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md))

- TypeScript generator: MomentData IR + ManifestEntry[] → TypeScript test files ([ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) rules)

- Progressive derivation engine: ProjectedMoment[] + ManifestEntry[] → DerivationBatch (this ADR)

- Schema validator: payload + manifest schema → validation result (Zod-based)

[ADR-005](ADR-005-gherkin-generation-layer-feature-file-generation-from-moment.md) will later add a Gherkin generator to this same package: MomentData IR + ManifestEntry[] → .feature files + step definition scaffolds.

The package has zero infrastructure dependencies — it is a pure computation package. Infrastructure integration (DynamoDB persistence, Kafka subscription, WebSocket delivery) lives in the sift-worker-doc-projection Lambda that hosts the package.

### 10. No New Lambda Functions

The progressive derivation engine runs within the existing sift-worker-doc-projection Lambda (Category 9), consistent with [ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) §10. The derivation is triggered by the same Kafka consumer that processes moment projection updates. No new Lambda functions are introduced.

## Consequences

What becomes easier:

- Architects see specification errors as they occur — a schema mismatch between an event payload and the manifest is caught during the pipeline run, not discovered during manual review

- Per-phase batching presents derivation results as coherent units that match the pipeline's natural structure — the architect reviews a complete phase, not individual event assertions

- Schema mismatches produce GapIdentified events, connecting progressive derivation to the existing gap resolution workflow — no new resolution mechanism needed

- The cumulative test lifecycle enables run-over-run comparison: the architect can see which tests are consistently passing (stable specification) vs. which tests are intermittent (specification instability)

- The derivation WebSocket frame integrates live test feedback into the existing conversational interface — the architect sees test results alongside Sift's responses

What becomes harder:

- The derivation engine must handle incomplete moment specs — during a pipeline run, only some phases have completed. The derivation state for uncompleted phases is pending until their boundary event fires.

- Phase boundary detection requires the derivation engine to know which sourceEventType values are boundary events. This is a configuration mapping, not a dynamic discovery — adding a new phase requires updating the mapping.

- The derivation frame can arrive out of order relative to token/response frames if the pipeline is running during an active conversational turn. The client must handle interleaved frame types.

- Cumulative test persistence increases the DynamoDB item count in sift-projections-moment. For specifications with many pipeline runs, the derivation result history grows proportionally.

What this enables (downstream ADRs):

- [ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md): Moment-to-Seam Bridge — derived test cases that are consistently passing (status confirmed across multiple runs) are candidates for publishing as MomentSpecDefined events to .domain/specs/

- [ADR-005](ADR-005-gherkin-generation-layer-feature-file-generation-from-moment.md): Gherkin Generation Layer — the progressive derivation engine validates the same schemas that the Gherkin generator will use for step definition generation. The @complai/bdd-derivation package houses both.

## Compliance Impact

SOC 2 CC7.2: Progressive schema validation provides continuous monitoring of specification integrity during pipeline execution. Schema mismatches are surfaced as GapIdentified events with full diagnostic detail.

SOC 2 CC8.1: Version message on this ADR and all cascade updates serves as the change management audit trail. The derivation frame type addition cascades to Sift ADR-022.

## Alternatives Considered

1. Per-moment derivation trigger (rejected): Firing the derivation engine for every ProjectedMoment materialization produces excessive noise during extraction-heavy phases. A single document upload can produce 20+ ConceptStatementExtracted moments. Per-moment derivation would stream 20+ individual test results to the UI before the architect sees anything meaningful at the boundary crossing. Per-phase batching waits for the domain-significant boundary event and presents the complete phase as a coherent unit.

2. Per-crossing derivation trigger (rejected): Only triggering on ProjectedCrossing materializations would miss intra-context behavioral tests entirely. The architect would only see contract test results at context boundaries, with no visibility into whether internal phase assertions are passing. Per-phase includes both behavioral and contract tests for complete coverage.

3. Hybrid trigger — crossings immediate, intra-context deferred (rejected): Mixing trigger strategies adds complexity to the derivation engine without proportional benefit. The architect would see contract tests at crossing time but behavioral tests at phase boundaries — two different delivery cadences for the same phase. Per-phase batching unifies the delivery cadence: one batch per phase, all tests included.

4. Extend existing event WebSocket frame for derivation (rejected): Overloading the event frame with derivation payloads conflates domain event notifications with test derivation results. These are distinct concerns — the event frame notifies the architect that something happened in the specification; the derivation frame tells the architect whether what happened conforms to the expected specification shape. Separate frame types keep the protocol semantically clear.

5. SSE channel for derivation results (rejected): Adding a separate Server-Sent Events channel alongside the existing WebSocket would require the client to maintain two connection types. The WebSocket infrastructure (Sift ADR-022) already handles session-scoped, bidirectional communication with Management API delivery. Adding a frame type is cheaper than adding a transport protocol.

6. Ephemeral derivation results — reset per pipeline run (rejected): Resetting derivation results on each pipeline run loses the run-over-run comparison capability. The architect needs to see patterns: "this test was passing in runs 1-5 but started failing in run 6 after I confirmed that candidate." The cumulative lifecycle with stale transitions preserves this history, consistent with the moment projection's own lifecycle ([ADR-002](ADR-002-live-moment-projection-from-pipeline-events.md) §5).

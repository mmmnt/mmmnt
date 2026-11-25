# ADR-002: Live Moment Projection from Pipeline Events

Migrated from Confluence page 11829252 (version 3, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/11829252. The Confluence space is private; this file is now the record.

Migrated from Sift: This ADR originated as Sift ADR-036. Migrated to the Moment space March 2026 when the Moment Specification Language was established as an independent project.

- **Status:** Proposed
- **Release:** R6
- **Date:** 2026-03-06
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Sift Origin:** ADR-036
- **Tags:** client-app:spec-view

## Context

[ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md) introduced the Moment DSL as a business-readable language for describing event chains across bounded contexts. In [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md), moment specs are authored statically — an architect writes a .moment declaration to describe the expected flow (e.g., Moment A: First-Time Document Ingestion), and the dual-renderer visualization pipeline produces timeline and sequence card views from the authored DSL.

This creates a gap: the Moment DSL describes what the system should do, but provides no mechanism to observe what the system actually does as Sift's pipeline processes input. The events that the moment spec describes — InputSourceRegistered, NormalizationCompleted, InterpretationStarted, ContextDefined — are live domain events flowing through Sift's bounded contexts. The pipeline already emits the exact events the moment spec references.

Separately, Sift's pipeline events carry structured payloads defined by Zod schemas (Sift ADR-004). These payload schemas are data contracts — the same schemas that [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md)'s BDD derivation engine uses to generate contract test assertions. If the moment projection consumes live events, the event schema becomes the validation contract for each moment, enabling progressive specification verification as the pipeline executes.

Model Registry owns the specification as an event-sourced entity and hosts the system-scoped projections (SpecificationStateView, DecisionChainView, ProvenanceChainView, etc.). A live moment projection is specification-scoped (it accumulates across refinement sessions and persists across the specification's lifetime), making Model Registry the natural home.

## Decision

### 1. MomentProjectionView as a Model Registry System-Scoped Projection

A new MomentProjectionView projection is added to Model Registry's system-scoped projections (7th projection). It materializes Moment DSL constructs — phases, moments, context crossings, and branch points — from live pipeline events as they flow through Sift's bounded contexts.

Source events (three categories):

- Ingestion lifecycle: InputSourceRegistered, ConceptStatementExtracted, ExtractionCompleted, NormalizationCompleted, InputProcessingStalled, InputSufficiencyFailed, CoachingOutputSubmittedAsInput

- Interpretation lifecycle: InterpretationStarted, InterpretationCompleted, all candidate spec events with source: "sift:interpretation"

- Model Registry spec events: ContextDefined, AggregateAdded, ContextRelationshipDefined, GapIdentified, GapResolved, CandidateConfirmed, CandidateOverridden, CandidateRejected

The projection does not consume Refinement session events (RefinementSessionStarted, ConversationalTurnRecorded) or Schema Governance events. These do not produce moments.

### 2. Dual-Mode Moment Specs: Authored and Projected

The moment system supports two coexisting modes:

Authored moment specs express design intent. These are the static .moment declarations from [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md) — hand-written by the architect or generated during specification design. They describe what the system should do. Authored moment specs are immutable once published; they change only through explicit revision.

Projected moment specs express observed reality. These are materialized by MomentProjectionView as events arrive. They describe what the system actually did during pipeline execution. Projected moment specs grow progressively — each event that arrives populates a moment, establishes a context crossing, or confirms a branch path.

Both modes produce the same MomentData IR defined in [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md), enabling both authored and projected moment specs to render through the same dual-renderer visualization pipeline (timeline view and sequence card view).

### 3. Event-to-Moment Inference

Each pipeline event maps to a moment through deterministic inference rules:

| Event                                        | Inferred Moment                       | Context             | Phase                    |
| -------------------------------------------- | ------------------------------------- | ------------------- | ------------------------ |
| InputSourceRegistered                        | "Input source arrives"                | Ingestion           | Document Entry           |
| ConceptStatementExtracted                    | "Statement extracted" (per statement) | Ingestion           | Normalization            |
| ExtractionCompleted                          | "Extraction complete for source"      | Ingestion           | Normalization            |
| NormalizationCompleted                       | "Batch boundary signal"               | Ingestion           | Normalization            |
| InterpretationStarted                        | "Interpretation pass begins"          | Interpretation      | Specification Generation |
| Candidate spec events (ContextDefined, etc.) | "Candidate [nodeType] emitted"        | Interpretation      | Specification Generation |
| InterpretationCompleted                      | "Interpretation pass complete"        | Interpretation      | Specification Generation |
| CandidateConfirmed                           | "Architect confirms candidate"        | Model Registry      | Refinement Decision      |
| GapIdentified                                | "Gap surfaced"                        | Structural Analysis | Analysis                 |
| GapResolved                                  | "Gap resolved"                        | Model Registry      | Refinement Decision      |

Each inferred moment carries:

- momentId: Deterministic, derived from eventId (same event always produces same moment)

- observedAt: Event timestamp

- sourceEventId: The event that produced this moment (provenance link)

- pipelineRunId: Correlation ID grouping moments from the same pipeline execution (derived from InputSourceRegistered.sourceId)

### 4. Context Crossing Inference

When the projection detects an event in Context B that was causally triggered by an event in Context A (via causationId in event metadata), it infers a crosses-to relationship. The relationship type is resolved by looking up ContextRelationshipDefined events in SpecificationStateView:

- Resolved crossing: A ContextRelationshipDefined event exists for the source→target context pair. The crossing carries the declared relationship type (Partnership, Customer-Supplier, Conformist, ACL, OHS/Published Language, Separate Ways).

- Unresolved crossing: No ContextRelationshipDefined event exists yet. The crossing is materialized with relationshipType: "unresolved". When a ContextRelationshipDefined event eventually arrives, the projection retroactively enriches all unresolved crossings for that context pair.

The canonical example: NormalizationCompleted (Ingestion) causes InterpretationStarted (Interpretation). The crossing type is looked up from ContextRelationshipDefined between Ingestion and Interpretation. In Sift's domain specification, this is a Customer-Supplier relationship — but the projection derives this from the spec, not from hardcoded knowledge.

Unresolved crossings in the live visualization are a signal to the architect: "you have a boundary here that hasn't been formally characterized yet." This is a feature, not a limitation.

### 5. Projection Lifecycle: Accumulating, Not Resetting

The projected moment spec is a living projection scoped to a specification (specificationId). It does not reset per pipeline run. Each pipeline run (triggered by a new InputSourceRegistered or InputSourceRevisionDetected) adds new moments or re-confirms existing ones.

Moment states:

| State     | Meaning                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| observed  | Event arrived and moment materialized in the current or a recent pipeline run                        |
| confirmed | Moment has been observed across multiple pipeline runs (stable pattern)                              |
| stale     | Moment was previously observed but did not appear in the most recent pipeline run for the same phase |

A moment transitions to stale when a pipeline run completes (InterpretationCompleted for the interpretation phase, NormalizationCompleted for the ingestion phase) without the moment's source event appearing. Stale moments are never deleted — they persist in the projection for audit and diff purposes.

The pipelineRunId on each moment enables filtering: "show me only moments from the latest run" or "show me the accumulated moment spec across all runs."

### 6. MomentReconciliationView: Authored vs. Projected Diff

A companion MomentReconciliationView projection consumes both authored moment spec IR (from [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md)'s static declarations) and projected moment spec state (from MomentProjectionView). It produces a reconciliation diff with three signal types:

| Signal                 | Meaning                                                                                                     | Architect Action                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Expected, not observed | Authored moment spec declares a moment that the projection has never materialized                           | Pipeline may not have reached this point yet, or the authored moment spec describes a path not yet triggered |
| Observed, not expected | Projection materialized a moment that no authored moment spec declares                                      | Unexpected pipeline behavior discovered — may indicate a missing moment spec branch or an undocumented flow  |
| Relationship mismatch  | Both authored and projected moment specs have the same moment, but the crosses-to relationship type differs | Authored intent and actual specification disagree on the context relationship type                           |

The reconciliation view is a read model — it does not emit events or trigger commands. It is consumed by the UI to render the authored-as-expected / projected-as-actual diff overlay on the moment visualization.

### 7. Projection State Schema

```
interface MomentProjectionState {
  specificationId: string;
  moments: ProjectedMoment[];
  crossings: ProjectedCrossing[];
  pipelineRuns: PipelineRunSummary[];
}

interface ProjectedMoment {
  momentId: string;
  sourceEventId: string;
  sourceEventType: string;
  context: string;
  phase: string;
  label: string;
  state: "observed" | "confirmed" | "stale";
  firstObservedAt: string;
  lastObservedAt: string;
  pipelineRunIds: string[];
  payload: Record<string, unknown>;
}

interface ProjectedCrossing {
  crossingId: string;
  fromMomentId: string;
  toMomentId: string;
  fromContext: string;
  toContext: string;
  relationshipType: string | "unresolved";
  resolvedFromEventId?: string;
}

interface PipelineRunSummary {
  pipelineRunId: string;
  sourceId: string;
  startedAt: string;
  completedAt?: string;
  momentCount: number;
  crossingCount: number;
  unresolvedCrossingCount: number;
}
```

### 8. DynamoDB Persistence

The projection state is persisted in a new sift-projections-moment DynamoDB table.

| PK                     | SK                    | Attributes                        |
| ---------------------- | --------------------- | --------------------------------- |
| SPEC#{specificationId} | MOMENT#{momentId}     | All ProjectedMoment fields        |
| SPEC#{specificationId} | CROSSING#{crossingId} | All ProjectedCrossing fields      |
| SPEC#{specificationId} | RUN#{pipelineRunId}   | All PipelineRunSummary fields     |
| SPEC#{specificationId} | RECONCILIATION#latest | Latest reconciliation diff output |

GSI-context: PK: context, SK: lastObservedAt — enables "show me all moments in Interpretation context" queries.

GSI-state: PK: state, SK: lastObservedAt — enables "show me all stale moments" queries.

This adds one DynamoDB table to the infrastructure inventory (Sift ADR-002 cascade target).

### 9. Trigger and Rebuild

The MomentProjectionView is triggered by the same Kafka consumer pattern used by other system-scoped projections. Events from the three source categories arrive via Kafka topics, and the projection handler updates DynamoDB.

Full rebuild from Kurrent follows the Sift ADR-008 pattern: replay all events in specification order, re-derive all moments and crossings. The projection is deterministic — same events always produce the same projected moment spec.

### 10. No New Lambda Functions

The MomentProjectionView handler runs within the existing sift-worker-doc-projection Lambda (Category 9). The reconciliation view computation runs in the same Lambda, triggered after the moment projection updates. No new Lambda functions are introduced — this is an additional projection handler within the existing Category 9 infrastructure.

## Consequences

What becomes easier:

- Architects see how events flow across bounded contexts in real time as Sift processes input — not after the fact

- Unresolved context crossings surface specification gaps that static analysis cannot detect (missing ContextRelationshipDefined events)

- Stale moments reveal pipeline behavior changes across specification revisions without manual diffing

- The reconciliation diff between authored and projected moment specs creates a continuous validation loop: design intent vs. observed behavior

- The payload snapshot on each projected moment enables [ADR-003](ADR-003-progressive-test-derivation-with-streaming-results.md) (Progressive Test Derivation) to validate event schemas against expected contracts as events arrive

What becomes harder:

- The projection must handle eventually consistent crossing resolution — unresolved crossings that later become resolved require retroactive enrichment, adding complexity to the projection handler

- The living (non-resetting) projection accumulates state over the specification's lifetime; large specifications with many pipeline runs will produce large projected moment specs that need efficient query patterns

- Dual-mode moment specs (authored + projected) double the data the UI must render; the client must clearly distinguish the two modes to avoid architect confusion

- DynamoDB table count increases by one (cascade to Sift ADR-002)

What this enables (downstream ADRs):

- [ADR-003](ADR-003-progressive-test-derivation-with-streaming-results.md): Progressive Test Derivation — the payload field on ProjectedMoment provides the event schema snapshot needed for in-flight contract validation

- [ADR-004](ADR-004-moment-to-seam-bridge-cross-product-moment-spec-publishing.md): Moment-to-Seam Bridge — projected moments that pass schema validation can be transformed into MomentSpecDefined events for Seam consumption

## Compliance Impact

SOC 2 CC7.2: The projection provides continuous monitoring of pipeline behavior through moment state tracking (observed → confirmed → stale). The reconciliation view surfaces divergence between expected and actual system behavior — a monitoring control.

SOC 2 CC8.1: Version message on this ADR and all cascade updates serves as the change management audit trail.

## Alternatives Considered

1. Moment projection in the Refinement context (rejected): Placing the projection in Refinement would scope it to individual sessions. Moment accumulation across sessions requires specification-scoped persistence, which is Model Registry's domain. Refinement context owns session lifecycle, not specification lifecycle.

2. Moment projection as a new bounded context (rejected): A dedicated "Moment" context was considered but rejected. The projection is a read model with no aggregates, no commands, and no domain events of its own. It consumes events from other contexts and materializes views. This is exactly the role of a system-scoped projection within Model Registry, consistent with DecisionChainView and ProvenanceChainView.

3. Resetting projection per pipeline run (rejected): Resetting the projected moment spec on each new pipeline run would lose the accumulated behavioral history. The architect needs to see patterns across runs — which moments are stable, which appeared only once, which disappeared after a specification change. The accumulating model with moment states (observed/confirmed/stale) preserves this history.

4. Projected moment specs replace authored moment specs (rejected): Removing authored moment specs in favor of projection-only moment specs eliminates the design intent signal. The reconciliation between authored (expected) and projected (actual) is the primary value — it surfaces divergence. Without authored moment specs, there's nothing to diverge from.

5. Hardcoded relationship types on crossings (rejected): The projection could embed known relationship types (e.g., Ingestion→Interpretation is always Customer-Supplier) rather than looking them up from SpecificationStateView. Rejected because the projection is a general mechanism — it must work for any specification's context topology, not just Sift's internal architecture. The lookup-based approach is specification-agnostic.

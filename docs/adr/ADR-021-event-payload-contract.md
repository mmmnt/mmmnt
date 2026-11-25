# ADR-021: Event Payload Contract — Moment

Migrated from Confluence page 21922129 (version 2, last updated 2026-04-18), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/21922129. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.1
- **Date:** 2026-03-15 (v1.0); 2026-04-17 (v1.1)
- **Parent ADR:** PADR-004: Event Payload Contract
- **Parent Version:** 1.6 (was 1.2 at v1.0 authoring)
- **Cross-References:** [ADR-022](ADR-022-cascade-execution-architecture.md): Cascade Execution Architecture — Moment, [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md): Simulation Output Contracts, [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md): Translation Layer Architecture — Live Sift Projection Consumption

## Context

Moment is the unified Domain Specification Language and Implementation Toolchain with dual deployment: Moment CLI (local JSONL event files) and Moment Cloud (Kurrent Cloud event streams + Kafka distribution). PADR-004 explicitly addresses both deployment paths — the ComplaiEventEnvelope must be serializable to both JSONL (local) and Kafka (cloud) without structural differences.

Moment has two unique characteristics in the event payload contract:

- CLI local events with future sync. Moment CLI emits events to local JSONL files with ses_local_{userId} session IDs. When synced to Moment Cloud (PADR-003 OQ-2, post-V1), the SyncAnchor aggregate rebinds sessionId to the authenticated cloud session and maps local causation IDs to cloud causation IDs. The envelope must support this rebinding without losing causal integrity.

- ConsumptionManifest pattern ownership. PADR-004 §5 references the ConsumptionManifest pattern for schema deprecation lifecycle — this pattern is owned by Moment (inherited from the former Seam scope per PADR-006). The ConsumptionManifest enables zero-consumption proof: a field can only be removed from the envelope when all consumers have migrated.

v1.1 note (2026-04-17): Subsequent Moment ADRs ([ADR-022](ADR-022-cascade-execution-architecture.md), [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md), [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)) have introduced additional event types and Kafka topics that conform to this delegate's envelope contract without modification. [ADR-022](ADR-022-cascade-execution-architecture.md) adds MomentReconcileCompleted, MomentValidationCompleted, and the local event signaling mechanism for .complai/events/moment/. [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) adds five simulation events (SimulationStarted, SimulationStepCompleted, SimulationAssertionPassed, SimulationAssertionFailed, SimulationCompleted) for Facet consumption. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) adds three translation layer events (MomentTranslationCompleted, MomentConvergenceLost, MomentProjectionSchemaMismatch) on a new topic. This ADR incorporates all of them into the catalog and topic inventory below. No envelope field changes are required; this delegate remains the authoritative envelope contract for Moment.

## Inherited Decisions

The following decisions from PADR-004 are adopted by Moment without modification:

- ComplaiEventEnvelope structure — all Moment events (CLI and Cloud) carry the canonical envelope fields

- @complai/events library — Moment Cloud uses the shared library; Moment CLI uses a local-compatible variant

- Kafka serialization — JSON message value, eventId as message key, CloudEvents-compatible headers (Cloud only)

- Schema evolution rules — additive-only field changes; breaking changes require new eventType

- System session ID pattern — Moment Cloud background processes use ses_system_moment_{process}

## Moment-Specific Adaptations

### Event Factory Initialization — Dual Context

Moment Cloud:

```
const events = createEventFactory({
  productSource: 'moment',
  sessionResolver: () => {
    // Subgraph context: read from X-Complai-Session header
    // Background projection updater: return 'ses_system_moment_projection-updater'
    // Translation layer (ADR-025): return 'ses_system_moment_translation-layer'
  },
  correlationResolver: () => {
    // Subgraph context: read from X-Complai-Correlation-Id header
    // Background: generate new correlationId
    // Translation layer: propagate Sift event's correlationId through the fold
  }
});
```

Moment CLI:

```
// CLI uses a local-compatible event factory
const events = createLocalEventFactory({
  productSource: 'moment',
  sessionId: `ses_local_${userId}`,  // Local user identity
  outputPath: '.moment/events/',      // JSONL output directory
});
```

The local event factory produces structurally identical ComplaiEventEnvelope objects but writes them to JSONL files instead of Kafka. The @complai/events library provides both createEventFactory (Cloud) and createLocalEventFactory (CLI) from the same package — ensuring envelope structural parity.

### Event Type Catalog

| eventType                       | Version | Deployment  | Trigger                                                      | Key Payload Fields                                                             | Governed By                                                                                                |
| ------------------------------- | ------- | ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| MomentParsed                    | 1       | CLI + Cloud | Moment DSL file parsed                                       | specificationId, astNodeCount, parseWarnings[], parseDuration                  | ADR-021                                                                                                    |
| MomentValidated                 | 1       | CLI + Cloud | Specification passes structural validation                   | specificationId, validationResult, ruleViolations[]                            | ADR-021                                                                                                    |
| SpecificationImported           | 1       | Cloud only  | Sift specification imported via SiftSpecificationImporter    | specificationId, siftSpecificationId, importedConceptCount                     | [ADR-017](ADR-017-sift-to-moment-import-translation.md)                                                    |
| FlowDefined                     | 1       | CLI + Cloud | A temporal flow is defined or updated                        | flowId, specificationId, momentCount, participantCount                         | ADR-021                                                                                                    |
| MomentDefined                   | 1       | CLI + Cloud | A moment primitive is defined or updated                     | momentId, flowId, participantIds[], timingConstraints[]                        | ADR-021                                                                                                    |
| DerivationStarted               | 1       | CLI + Cloud | Gherkin derivation begins                                    | specificationId, derivationType, manifestScenarioCount                         | ADR-021                                                                                                    |
| ScenarioDerived                 | 1       | CLI + Cloud | Single Gherkin scenario derived                              | scenarioId, flowId, scenarioTitle, gherkinContent                              | ADR-021                                                                                                    |
| DerivationCompleted             | 1       | CLI + Cloud | All manifested scenarios derived                             | specificationId, derivedScenarioCount, completionStatus                        | ADR-021                                                                                                    |
| TypeScriptProjectionGenerated   | 1       | CLI + Cloud | @mmmnt/emit-ts produces TypeScript files                     | specificationId, fileCount, conceptsCovered, manifestCompleteness              | ADR-021                                                                                                    |
| SchemaGovernanceReportGenerated | 1       | CLI + Cloud | @mmmnt/schema produces a governance report                   | specificationId, diffSummary, migrationStepCount, compatibilityAssessment      | ADR-021                                                                                                    |
| SyncPushInitiated               | 1       | Cloud only  | CLI sync payload received by SyncAnchor                      | sourceSpecificationId, remoteSpecificationId, eventCount, syncToken            | ADR-021                                                                                                    |
| SyncCompleted                   | 1       | Cloud only  | CLI sync successfully processed                              | remoteSpecificationId, syncedEventCount, idMappingCount, newSyncToken          | ADR-021                                                                                                    |
| MomentReconcileCompleted        | 1       | CLI + Cloud | @mmmnt/sync reconciliation completes                         | specificationId, upstreamFingerprint, cascadeClassification, resolvedDiffCount | [ADR-022](ADR-022-cascade-execution-architecture.md)                                                       |
| MomentValidationCompleted       | 1       | CLI + Cloud | PADR-001 IR validation passes                                | specificationId, validationResult, ruleViolations[]                            | [ADR-018](ADR-018-completion-assurance-pipeline.md) / [ADR-022](ADR-022-cascade-execution-architecture.md) |
| SimulationStarted               | 1       | CLI + Cloud | moment simulate invocation begins                            | simulationId, specificationId, contextMap, timestamp                           | [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md)                       |
| SimulationStepCompleted         | 1       | CLI + Cloud | Single event in the simulation trace                         | simulationId, stepId, sourceContext, targetContext, eventType, stateSnapshot   | [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md)                       |
| SimulationAssertionPassed       | 1       | CLI + Cloud | Behavioral assertion passed during simulation                | simulationId, assertionId, targetElement, expected, actual                     | [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md)                       |
| SimulationAssertionFailed       | 1       | CLI + Cloud | Behavioral assertion failed during simulation                | simulationId, assertionId, targetElement, expected, actual, diagnostic         | [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md)                       |
| SimulationCompleted             | 1       | CLI + Cloud | Simulation finishes                                          | simulationId, totalEvents, passCount, failCount, duration, traceSummary        | [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md)                       |
| MomentTranslationCompleted      | 1       | Cloud only  | Translation layer emission after convergence unlock          | specificationId, sourceEventHead, projectionVersion, nodeCounts{}              | [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) D4                   |
| MomentConvergenceLost           | 1       | Cloud only  | Translation layer emission gate re-locked                    | specificationId, reason, triggeringEventId, lostAt                             | [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) D4                   |
| MomentProjectionSchemaMismatch  | 1       | Cloud only  | Schema reconciler detected unrecognized projection structure | specificationId, notes[], affectedNodeIds[], overallImpact                     | [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) D5                   |

### CLI Session Identity

Per PADR-004 §2, CLI events carry ses_local_{userId} as the sessionId. The userId is derived from the local git configuration (git config user.email) to provide meaningful attribution without requiring cloud authentication.

Sync rebinding: When CLI events are synced to Moment Cloud (post-V1), the SyncAnchor aggregate:

- Reads the authenticated cloud session from X-Complai-Session

- Replaces ses_local_{userId} with the cloud sessionId

- Maps each local eventId to a new cloud eventId (UUID)

- Maps each local causationEventId to the corresponding cloud eventId via the SyncIdMap

- Preserves the original correlationId (workflow identity is portable)

The original CLI event (with local IDs) is stored in the SyncAnchor's event stream as a SyncSourceEvent for audit purposes. The rebinding produces a new cloud event that is structurally indistinguishable from a natively Cloud-authored event.

### ConsumptionManifest Pattern

Moment owns the ConsumptionManifest pattern (inherited from Seam per PADR-006). This pattern governs envelope schema deprecation:

- Each consuming product maintains a manifest of which envelope fields it reads

- When a field is proposed for deprecation, the platform team queries all consumption manifests

- A field is removed only when zero active consumers declare it

- This is consumer-driven deprecation — the producer does not unilaterally remove fields

The ConsumptionManifest is implemented as a configuration file in each product's monorepo (consumption-manifest.json) that declares the envelope fields and event types the product consumes. The manifest is checked into source control and validated by CI.

Extended scope (v1.1): The ConsumptionManifest pattern also governs the folded projection schema evolution per ADR-052 D5. When Sift's projection exposes a new node type or field, Moment's translation layer declares consumption via consumption-manifest.json; when Moment retires consumption of a field, Sift can only remove it from the projection after zero-consumption is proven across all projection-consuming products. This extends the pattern from envelope-level to projection-level governance.

### Kafka Topics (Cloud)

| Topic                                      | Direction | Events                                                                                                                | Governed By                                                                                                |
| ------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| complai.moment.specification.dsl-events    | Produce   | MomentParsed, MomentValidated, SpecificationImported, FlowDefined, MomentDefined                                      | ADR-021                                                                                                    |
| complai.moment.specification               | Produce   | MomentValidationCompleted (PADR-001 surface)                                                                          | [ADR-018](ADR-018-completion-assurance-pipeline.md) / [ADR-022](ADR-022-cascade-execution-architecture.md) |
| complai.moment.derivation.progress-events  | Produce   | DerivationStarted, ScenarioDerived, DerivationCompleted                                                               | ADR-021                                                                                                    |
| complai.moment.generation.lifecycle-events | Produce   | TypeScriptProjectionGenerated, SchemaGovernanceReportGenerated                                                        | ADR-021                                                                                                    |
| complai.moment.assurance.completion-events | Produce   | ProjectionWriteCompleted                                                                                              | ADR-021                                                                                                    |
| complai.moment.sync                        | Produce   | MomentReconcileCompleted                                                                                              | [ADR-022](ADR-022-cascade-execution-architecture.md)                                                       |
| complai.moment.sync.lifecycle-events       | Produce   | SyncPushInitiated, SyncCompleted                                                                                      | ADR-021                                                                                                    |
| complai.moment.simulation                  | Produce   | SimulationStarted, SimulationStepCompleted, SimulationAssertionPassed, SimulationAssertionFailed, SimulationCompleted | [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md)                       |
| complai.moment.translation                 | Produce   | MomentTranslationCompleted, MomentConvergenceLost, MomentProjectionSchemaMismatch                                     | [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)                      |

### JSONL Event Files (CLI)

CLI events are written to .moment/events/{specificationId}/{date}.jsonl. Each line is a JSON-serialized ComplaiEventEnvelope. The file naming convention enables efficient replay by specification and time range.

Local event signaling ([ADR-022](ADR-022-cascade-execution-architecture.md)). In addition to .moment/events/, [ADR-022](ADR-022-cascade-execution-architecture.md) introduces a parallel local event directory at .complai/events/moment/ for cross-product local signaling (pre-cloud-sync events that other local products may need to observe, like @mmmnt/mcp). Both directories use the same JSONL format and carry the same ComplaiEventEnvelope structure.

## Consequences

Positive:

- Structural parity between CLI and Cloud events means synced events require only ID rebinding, not structural transformation. The same validation logic works against both JSONL and Kafka-serialized events.

- The ConsumptionManifest pattern provides programmatic proof that a deprecated field has zero consumers before removal — preventing silent downstream breakage during envelope evolution.

- CLI events are immediately usable by Cloud consumers after sync — the SyncAnchor rebinding produces events that are structurally indistinguishable from Cloud-native events.

- New event types added by [ADR-022](ADR-022-cascade-execution-architecture.md), [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md), and [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) conform to this envelope contract without requiring this delegate to evolve — demonstrating the envelope's extensibility under additive-only evolution.

Negative:

- Two event factory implementations (createEventFactory for Cloud, createLocalEventFactory for CLI) must be maintained in the same library. Mitigated by: both share the same Zod schema validation and fingerprinting logic — the difference is the serialization target (Kafka vs JSONL).

- CLI events carry local user identity (git config user.email) which may not match the cloud user identity. Mitigated by: sync rebinding replaces the session entirely — local identity is preserved only in the SyncAnchor audit trail.

## Compliance Notes

Moment Cloud's event emission with full ComplaiEventEnvelope provides SOC 2 CC6.1 traceability for all specification operations. CLI events in JSONL format provide a local audit trail that, when synced to Cloud, becomes part of the platform's auditable event history via the SyncAnchor's audit preservation.

Translation layer events ([ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)) contribute additional audit surfaces: MomentTranslationCompleted documents every emission unlock, MomentConvergenceLost documents every re-lock with reason attribution, and MomentProjectionSchemaMismatch documents every co-evolution debt detection with overallImpact classification. This provides Proof with a complete audit trail for the Sift→Moment translation boundary.

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-03-15 | Initial publication. Binds PADR-004 v1.2 to Moment. Establishes dual-deployment event factory (Cloud + CLI), 12 event types, CLI session identity with sync rebinding protocol, ConsumptionManifest pattern ownership, Kafka topic inventory (5 topics), and JSONL file convention for CLI events.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1.1     | 2026-04-17 | Catch-up cross-reference pass. Parent Version updated to PADR-004 v1.6 (current). Cross-References field added linking to [ADR-022](ADR-022-cascade-execution-architecture.md), [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md), [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md). Context v1.1 note added documenting the three downstream ADRs that emit new events under this envelope contract. Event factory initialization extended with translation layer session identity ([ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)). Event Type Catalog extended with 10 new events across [ADR-022](ADR-022-cascade-execution-architecture.md) (2: MomentReconcileCompleted, MomentValidationCompleted), [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) (5: SimulationStarted, SimulationStepCompleted, SimulationAssertionPassed, SimulationAssertionFailed, SimulationCompleted), and [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) (3: MomentTranslationCompleted, MomentConvergenceLost, MomentProjectionSchemaMismatch). Governed By column added to both event catalog and topic inventory. Kafka Topics extended with 4 new topics (complai.moment.specification, complai.moment.sync, complai.moment.simulation, complai.moment.translation). ConsumptionManifest scope extended to govern folded projection schema evolution (ADR-052 D5). Local event signaling subsection added ([ADR-022](ADR-022-cascade-execution-architecture.md) .complai/events/moment/). Compliance Notes extended with translation-layer audit surface description. No envelope field changes. |

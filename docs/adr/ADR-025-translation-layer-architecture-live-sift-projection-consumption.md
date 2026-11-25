# ADR-025: Translation Layer Architecture — Live Sift Projection Consumption

Migrated from Confluence page 67076117 (version 2, last updated 2026-04-20), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/67076117. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Release:** V1 — Moment Cloud Integration
- **Date:** 2026-04-17
- **Deciders:** listenrightmeow
- **Supersedes:** None (new ADR)
- **Informed By:** PADR-004: Event Payload Contract v1.6, PADR-003: Federated Router Architecture, Moment [ADR-017](ADR-017-sift-to-moment-import-translation.md): Sift-to-Moment Import Translation, Moment [ADR-021](ADR-021-event-payload-contract.md): Event Payload Contract — Moment, Moment [ADR-022](ADR-022-cascade-execution-architecture.md): Cascade Execution Architecture — Moment, Moment PRD v0.9, Sift ADR-052: Projection Exposure Contract for Moment Consumption
- **Companion ADR:** Sift ADR-052 (Projection Exposure Contract for Moment Consumption)
- **Cascade Landed In:** Moment Domain Specification Pass 4 (Translation Layer Addendum) (2026-04-19)
- **Tags:** @mmmnt/core, translation-layer, convergence-gate, schema-reconciler, published-language:consumer

## Revision History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-17 | Initial publication. Establishes the live streaming translation layer that consumes Sift's folded projection (per Sift ADR-052) and produces .moment DSL text plus direct AST feed into @mmmnt/emit-ts. Seven decisions: D1 (subscription pattern — Kafka cloud + JSONL CLI parity), D2 (internal representation — MomentSpecificationFold), D3 (projection-to-AST rule table — deterministic, no AI), D4 (convergence gate), D5 (schema reconciler — co-evolution debt signal), D6 (dual emitter outputs — DSL text + direct AST), D7 (no AI constraint — PADR-008 N/A). Relationship to [ADR-017](ADR-017-sift-to-moment-import-translation.md) established: complementary batch vs. stream paths. |
| 1.0.1   | 2026-04-19 | Cascade back-reference added. The "Moment Domain Specification (next pass)" cascade requirement has been discharged by Moment Domain Specification Pass 4 (Translation Layer Addendum) with gap report Pass 4 Gap Report. No decisions altered; metadata-only revision.                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Context

Moment's primary input is hand-authored .moment DSL files (Design Principle #15 — open-source independence). Its optional second input is Sift — an upstream supplier that automates Event Storming and produces complete domain specifications (Design Principle #16).

Moment [ADR-017](ADR-017-sift-to-moment-import-translation.md) defined the batch file-based import path: a user runs moment import --from-sift \<snapshot>, Moment reads a snapshot export, and .moment files are written deterministically. This is a one-shot translation — each invocation processes a complete, frozen specification snapshot.

That path is insufficient for a live cloud integration. When Moment Cloud operates as a Complai subgraph alongside Sift Cloud, and a specification is being actively refined in Sift, Moment must be able to consume the evolving specification continuously — folding each new event into an internal representation, deciding when the specification is stable enough to emit, and surfacing structural mismatches when Sift's projection evolves ahead of Moment's rule table.

Sift ADR-052 (companion, same day) establishes what Sift exposes: a folded projection of the event stream, available via a GraphQL subgraph query or a JSONL export, with convergence signaled by a dedicated event. This ADR establishes what Moment does with that exposure.

The critical constraints:

- Deterministic translation only. No AI, no inference, no heuristics. PADR-008 (Learning Integration Requirements) does not apply — Moment has no InterpretationEngine in this path or anywhere else. See D7.

- Convergence-gated emission. Emission of .moment files and TypeScript artifacts must be blocked until Sift signals that the specification has converged. Emitting partial or contradictory specifications would cascade unstable artifacts downstream to Forge, Proof, and Facet.

- Co-evolution awareness. Sift and Moment evolve on independent release cadences. When Sift's projection carries a node type Moment's AST builder doesn't recognize, Moment must refuse emission for the affected nodes, log the mismatch, and surface it as co-evolution debt — not fail silently, not guess.

- Independence preservation. Moment's open-source packages must not gain a runtime or build-time dependency on any Complai service (Design Principle #15). Live streaming consumption is a Cloud-mode capability; CLI mode operates over exported JSONL without requiring a live Sift connection.

This ADR specifies the architecture that satisfies all four. It does not replace [ADR-017](ADR-017-sift-to-moment-import-translation.md) — both paths remain, both produce identical .moment files.

## Decision 1: Subscription Pattern

### Status: Proposed

### Decision

Moment's translation layer consumes Sift's folded projection through two parity-identical pathways, selected by deployment mode:

Cloud mode — Kafka subscription. Moment Cloud's translation layer subscribes to Sift's Kafka topics:

| Topic                                | Purpose                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| complai.sift.specification.\*        | Building block events — the raw structural events Sift emits. Each carries a ComplaiEventEnvelope (PADR-004 §1). |
| complai.sift.specification-lifecycle | Convergence signals — SpecificationConverged and SpecificationConvergenceLost (Sift ADR-052 D4).                 |

Consumer group name: moment-translation-layer. Offset commit is per-event after successful fold (see D2). Moment Cloud does not re-query Sift's GraphQL subgraph during normal operation — the incremental fold keeps an internal representation consistent with the latest event head.

Cold-start query. On initial attachment to a specification or on recovery from a consumer-group reset, Moment Cloud calls specificationProjection(id: ID!) on Sift's GraphQL subgraph (Sift ADR-052 D3) to obtain a full snapshot. Moment seeds its internal representation from the snapshot, records the sourceEventHead as its resume point, then resumes Kafka consumption from that offset.

CLI mode — JSONL export. Moment CLI operates over Sift's JSONL snapshot export format (Sift ADR-052 D3). The existing moment import --from-sift \<path> command ([ADR-017](ADR-017-sift-to-moment-import-translation.md)) becomes one specific invocation of this path — a one-shot read that seeds the internal representation and processes no further events. A new subcommand, moment sift watch \<path>, polls the export directory for updates and incrementally applies new events. Both read the identical on-disk structure; behavior diverges only in whether incremental updates are consumed.

Envelope invariant. All events consumed by Moment's translation layer carry the unmodified ComplaiEventEnvelope. Moment does not extract payload into a different shape before folding; the envelope fields (correlationId, causationEventIds, productSource, timestamp) are preserved in the internal representation for use by the cascade system ([ADR-022](ADR-022-cascade-execution-architecture.md)) and for diagnostic output.

### Consequences

Positive: Cloud and CLI users see identical translation behavior. A specification authored in Sift Cloud and consumed by Moment CLI produces .moment files byte-identical to the same specification consumed by Moment Cloud.

Positive: Design Principle #15 is preserved — no @mmmnt/\* package requires a network connection to Sift. The Kafka subscription is a Moment Cloud subgraph concern, not a core package dependency.

Positive: The cold-start GraphQL query is optional; the consumer-group resume path is the normal operating mode. Outage scenarios (Kafka lag, network partition) recover via Kafka's own retention.

Negative: Moment Cloud introduces a runtime dependency on Sift's Kafka topic availability. Mitigation: if the topic is unreachable at cold start, Moment Cloud fails the subscription activation with a clear diagnostic; it does not silently degrade. Existing subscriptions continue consuming the cached fold until Sift connectivity is restored.

## Decision 2: Internal Representation — MomentSpecificationFold

### Status: Proposed

### Decision

Moment's translation layer maintains a private internal representation called MomentSpecificationFold. This representation mirrors Sift's folded projection structure (Sift ADR-052 D2) but adds Moment-specific augmentations that Sift does not observe.

Structural core (mirrored from Sift's projection):

```
MomentSpecificationFold {
  specificationId:        string
  projectionVersion:      number
  convergenceState:       ConvergenceState       // from Sift ADR-052 D2
  contexts:               [ContextNode]           // from Sift ADR-052 D2
  ubiquitousTerms:        [TermNode]
  flows:                  [FlowNode] | null       // populated when SIFT-1 resolves
  sourceEventHead:        string
  lastFoldedAt:           string (ISO 8601)

  // Moment-specific augmentations — not exposed outside Moment
  upstreamFingerprint:    UpstreamFingerprint     // ADR-022
  cascadeClassification:  CascadeClassification   // ADR-022
  emissionGate:           EmissionGateState       // D4
  schemaReconciliation:   ReconciliationReport    // D5
}
```

Augmentation details:

- upstreamFingerprint — a content-derived hash over the projection structure and the sourceEventHead. Used by [ADR-022](ADR-022-cascade-execution-architecture.md) to detect drift when a specification is re-imported or re-exported. Recomputed on each fold.

- cascadeClassification — categorizes the last event received (Category 1 cosmetic / Category 2 structural / Category 3 behavioral, per [ADR-022](ADR-022-cascade-execution-architecture.md) §5.11.2). Drives which downstream Moment artifacts require regeneration.

- emissionGate — tracks whether emission is currently unlocked (see D4).

- schemaReconciliation — accumulates mismatches detected during the AST build (see D5).

Folding algorithm:

- On each event received, look up the event type in the fold rule table.

- If the event contributes to the projection (per Sift ADR-052 D1): apply the event's effect to the MomentSpecificationFold (add/remove/update a node).

- If the event is a convergence signal (SpecificationConverged / SpecificationConvergenceLost): update emissionGate (see D4).

- If the event is out-of-scope for the projection: ignore at the fold layer. (Moment may consume it elsewhere for diagnostics, but it does not affect the fold.)

- Update sourceEventHead and lastFoldedAt.

- Recompute upstreamFingerprint.

- Commit the Kafka offset (Cloud) or advance the JSONL read cursor (CLI).

Persistence.

- Cloud: the fold is persisted to DynamoDB with per-specification key. Recovery loads the persisted fold and resumes from sourceEventHead.

- CLI: the fold is persisted to .moment/.fold/{specificationId}.json in the Moment project directory. The .fold/ directory is .gitignore'd — it is operational state, not part of the specification.

Privacy. The fold is Moment's private concern. Sift has no access to it, no knowledge of its schema, and no dependency on its structure. Augmentations (upstreamFingerprint, cascadeClassification, emissionGate, schemaReconciliation) are never sent back to Sift.

### Consequences

Positive: The fold is cheap to rebuild — bounded by the number of events in the specification, not by any external state. Recovery is deterministic.

Positive: Moment-specific augmentations live in Moment, not in Sift's projection. This preserves Sift's projection schema stability (Sift ADR-052 D5) while giving Moment the state it needs for cascade detection and diagnostic output.

Negative: Fold storage size grows linearly with specification complexity. Mitigation: the fold is materialized, not a full event log — size is bounded by the projection's node count, not event history.

## Decision 3: Projection-to-AST Rule Table

### Status: Proposed

### Decision

Translation from MomentSpecificationFold to the Moment AST is governed by a deterministic rule table. One rule per projection node type. Each rule is a pure function: (FoldNode, FoldContext) → ASTNode.

Rule table (initial projectionVersion: 1):

| Fold Node Type   | AST Output                                                  | Rule Function                  |
| ---------------- | ----------------------------------------------------------- | ------------------------------ |
| ContextNode      | ContextDeclaration (in .moment/contexts/{name}.moment)      | buildContextDeclaration        |
| AggregateNode    | AggregateBlock (nested in ContextDeclaration)               | buildAggregateBlock            |
| CommandNode      | CommandDeclaration (nested in AggregateBlock)               | buildCommandDeclaration        |
| DomainEventNode  | EventDeclaration (nested in AggregateBlock)                 | buildEventDeclaration          |
| ValueObjectNode  | ValueObjectDeclaration (nested in AggregateBlock)           | buildValueObjectDeclaration    |
| InvariantNode    | InvariantDeclaration (nested in AggregateBlock)             | buildInvariantDeclaration      |
| PolicyNode       | PolicyDeclaration (nested in ContextDeclaration)            | buildPolicyDeclaration         |
| SagaNode         | SagaDeclaration (nested in ContextDeclaration)              | buildSagaDeclaration           |
| ProjectionNode   | ProjectionDeclaration (nested in ContextDeclaration)        | buildProjectionDeclaration     |
| TermNode         | (absorbed into .manifest.yaml glossary entry)               | buildGlossaryEntry             |
| RelationshipEdge | RelationshipDeclaration (context-level)                     | buildRelationshipDeclaration   |
| FlowNode         | FlowBlock (in .moment/flows/{name}.moment) — pending SIFT-1 | buildFlowBlock (slot reserved) |

Rule function signature:

```
function buildContextDeclaration(
  node:    ContextNode,
  context: FoldContext
): ContextDeclaration | SchemaReconciliationNote
```

Rules return either a valid AST node or a SchemaReconciliationNote (see D5). There is no third outcome — no inference, no partial build, no fallback.

Location. The rule table lives in @mmmnt/core alongside the grammar ([ADR-008](ADR-008-parser-technology-langium.md)) and the existing import translation logic ([ADR-017](ADR-017-sift-to-moment-import-translation.md)). Rationale: the grammar and the rule table are co-evolving artifacts. Placing them in separate packages would create either duplicate knowledge or a dependency cycle. The rule table is an optional code path — if moment sift or moment import --from-sift is never invoked, the rule table is dead code for the open-source user.

Evolution. Changes to the rule table require an ADR amendment. Adding a new rule for a previously-unrecognized projection node type is the primary forward-motion path when Sift's projection evolves (per Sift ADR-052 D5).

Relationship to [ADR-017](ADR-017-sift-to-moment-import-translation.md)'s mapping. [ADR-017](ADR-017-sift-to-moment-import-translation.md) defined a file-level mapping from Sift event types to .moment file structures. This ADR's rule table operates at the projection-node level — a higher-fidelity abstraction that produces the same end state. For batch import ([ADR-017](ADR-017-sift-to-moment-import-translation.md)), the rule table is applied once after the full snapshot is folded. For live streaming (this ADR), the rule table is applied incrementally as the fold evolves. Both paths produce identical .moment output because the rule table is deterministic and the fold converges to the same state regardless of how events are delivered.

### Consequences

Positive: Deterministic translation is auditable. Every emitted AST node traces back to a specific fold node, which traces back to a specific set of Sift events.

Positive: Rule table changes are explicit — ADR amendments are the mechanism, not silent updates.

Negative: Every new projection node type Sift introduces requires a Moment rule table extension before Moment can emit for it. Mitigation: D5 makes this a first-class observable state (co-evolution debt), not a silent failure.

## Decision 4: Convergence Gate

### Status: Proposed

### Decision

Moment's translation layer blocks emission of .moment files and TypeScript artifacts until the specification has converged (Sift ADR-052 D4). Emission resumes when convergence is signaled; emission re-locks when convergence is lost.

Gate state machine:

```
LOCKED (initial)
  ↓ SpecificationConverged received
UNLOCKED
  ↓ SpecificationConvergenceLost received
LOCKED
```

Behavior while LOCKED:

- The fold continues to accept events (per D2).

- The AST builder does not run.

- No files are written to .moment/contexts/ or .moment/flows/.

- No direct AST feed is sent to @mmmnt/emit-ts (per D6).

- moment status reports convergence: locked with the reason for the last state transition.

Behavior on LOCKED → UNLOCKED transition:

- Verify received SpecificationConverged event's projectionVersion is supported by the current rule table (D3). If not, D5 schema reconciliation runs first; gate remains LOCKED until mismatch is resolved.

- Run the full AST build against the current fold.

- Emit .moment files (D6 DSL output).

- Feed the AST to @mmmnt/emit-ts (D6 direct path).

- Write a MomentTranslationCompleted event to .complai/events/moment/ (per [ADR-022](ADR-022-cascade-execution-architecture.md) signaling). Payload includes sourceEventHead, projectionVersion, node counts.

- Update moment status to report convergence: unlocked, lastEmitted: \<timestamp>.

Behavior on UNLOCKED → LOCKED transition (SpecificationConvergenceLost):

- Emit a diagnostic MomentConvergenceLost event to .complai/events/moment/ with the reason from Sift's SpecificationConvergenceLost payload.

- Stop feeding subsequent changes to emitters.

- Retain previously-emitted files — do not roll back. Downstream consumers (Forge, Proof, Facet) continue operating against the last emitted state until the next UNLOCK.

- Update moment status to report convergence: locked, lastLockedReason: \<reason>.

New Moment event types (registered in @complai/events):

| Event                      | Topic                      | Purpose                                                                                  |
| -------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| MomentTranslationCompleted | complai.moment.translation | Signals successful emission of .moment files and TS artifacts after a convergence unlock |
| MomentConvergenceLost      | complai.moment.translation | Signals that emission has re-locked because Sift lost convergence                        |

Both follow ComplaiEventEnvelope (PADR-004 §1).

### Consequences

Positive: Downstream consumers never receive partial or contradictory Moment emissions. The convergence-gated path guarantees a stable emission point.

Positive: Re-locks do not destroy prior emissions. The downstream ecosystem is tolerant of revision cycles — new emission arrives on the next unlock.

Positive: The gate is deterministic and event-driven. No polling, no heuristic timing, no configurable threshold.

Negative: Long-running unresolved specifications produce no Moment output. This is working as intended — the convergence gate prevents premature emission. Mitigation: moment status surfaces gate state clearly; the open-source CLI path (hand-authored .moment files) is unaffected.

## Decision 5: Schema Reconciler

### Status: Proposed

### Decision

The schema reconciler is the translation layer's defense against silent corruption when Sift's projection evolves ahead of Moment's rule table. It operates during every AST build attempt (D4) and produces structured diagnostic output.

Detection conditions:

- Unknown projection node type. The fold contains a node whose type is not in Moment's rule table (D3).

- Unknown relationship type. A RelationshipEdge carries a type value Moment's buildRelationshipDeclaration doesn't recognize.

- Unknown field. A fold node contains a field Moment's rule function doesn't read and doesn't have a declared "ignored field" rule for.

- projectionVersion mismatch. Sift's declared projectionVersion exceeds Moment's maximumSupportedProjectionVersion.

Reconciler behavior:

- For each detection, construct a SchemaReconciliationNote:

```
SchemaReconciliationNote {
  detectedAt:            string (ISO 8601)
  condition:             "unknown-node-type" | "unknown-relationship-type"
                       | "unknown-field" | "version-mismatch"
  affectedNodeId:        string | null
  affectedPath:          string              // JSONPath into the fold
  observedValue:         string              // truncated for length
  momentRuleTableVersion: string
  siftProjectionVersion:  number
  suggestedAction:       string              // e.g., "extend buildRelationshipDeclaration for new type 'X'"
}
```

- Append the note to MomentSpecificationFold.schemaReconciliation.notes.

- Refuse emission for affected nodes. If the condition applies to a specific node (e.g., unknown node type), that node and its descendants are excluded from the AST build. Unaffected nodes are emitted normally. If the condition is structural (version mismatch), the entire AST build is refused.

- Emit a diagnostic event.

```
{
  "eventType": "MomentProjectionSchemaMismatch",
  "payload": {
    "specificationId":   "spec_...",
    "notes":             [SchemaReconciliationNote, ...],
    "affectedNodeIds":   ["...", "..."],
    "overallImpact":     "partial-emission" | "emission-refused",
    "detectedAt":        "2026-04-17T..."
  }
}
```

Registered on topic complai.moment.translation. Consumed by Glean for ecosystem co-evolution metrics and by Proof for audit trail completeness.

- Surface in moment status. The command's output includes a "Co-evolution debt" section listing all outstanding reconciliation notes with their suggested actions.

Resolution path.

- Mismatches are resolved by extending Moment's rule table (D3) via an ADR amendment, then releasing an updated @mmmnt/core.

- No automatic resolution. No inference about what the unknown structure "probably" means. No fallback emission.

### Consequences

Positive: Sift–Moment co-evolution is explicit. The product team sees co-evolution debt accumulate in real time and can prioritize rule table extensions accordingly.

Positive: Partial emission is possible — if only one context type is unrecognized, the other contexts still emit. Downstream consumers continue operating with the partial emission.

Positive: The schema reconciler is a first-class observable, not a log line. MomentProjectionSchemaMismatch events are queryable, auditable, and feed into platform analytics.

Negative: When co-evolution debt exists, downstream consumers receive an incomplete specification. Mitigation: the reconciler's scope (per-node vs. structural) bounds the damage; overallImpact makes the bound explicit on each emitted diagnostic.

## Decision 6: Emitter Outputs — DSL Text + Direct AST Feed

### Status: Proposed

### Decision

The translation layer produces two parallel outputs from a single AST build:

Output 1 — DSL text files. The AST is serialized to .moment files in the project's .moment/ directory:

- Spatial building blocks → .moment/contexts/{context-name}.moment (per [ADR-017](ADR-017-sift-to-moment-import-translation.md) file layout).

- Event Storming flows → .moment/flows/{flow-name}.moment (pending SIFT-1).

- The .manifest.yaml is regenerated with current context/flow entries.

These files are git-tracked. Humans can read them, diff them, review them, and — in principle — hand-edit them (though [ADR-017](ADR-017-sift-to-moment-import-translation.md)'s no-merge constraint applies: the next translation invocation overwrites hand edits).

Output 2 — direct AST feed into @mmmnt/emit-ts. The same AST is handed directly to the TypeScript emitter without first writing to disk and re-parsing. This path:

- Eliminates a round-trip through the parser for the Cloud-mode live translation.

- Guarantees byte-identical emission whether @mmmnt/emit-ts is invoked via the disk-and-parse path (Output 1 → parser → AST → emit-ts) or the direct-AST path (Output 2 → emit-ts).

- Is implemented as an additional entry point on @mmmnt/emit-ts: emitFromAST(ast: MomentAST): TypeScriptOutput alongside the existing emitFromFile(path: string).

Equivalence guarantee. Both paths operate on the same MomentAST type. A property-based test in @mmmnt/emit-ts's test suite verifies equivalence: for any AST, emitFromAST(ast) produces identical TypeScript to emitFromFile(serializeToFile(ast).path). This guarantee is part of the @mmmnt/emit-ts public contract, not an implementation detail.

Emission order. Output 1 precedes Output 2. If disk write fails, Output 2 is not attempted — the translation invocation fails atomically. This preserves the git-tracked record as the canonical audit artifact.

### Consequences

Positive: The disk-tracked .moment files remain the human-readable record — every translation leaves a reviewable artifact.

Positive: The direct AST feed eliminates serialization overhead for Cloud-mode live translation, keeping translation latency low.

Positive: The equivalence guarantee means .moment files and emitted TypeScript are always semantically aligned — no drift path where the TS is "newer" than the DSL.

Negative: @mmmnt/emit-ts gains a new entry point (emitFromAST) that must be maintained in parallel with emitFromFile. Mitigation: both share the same core transformation pipeline; only the input adapter differs.

## Decision 7: No AI in the Translation Layer

### Status: Proposed

### Decision

The translation layer contains zero AI components. Every transformation is deterministic structural mapping. This is an absolute constraint, not an implementation preference.

What this excludes:

- No LLM calls during event consumption, folding, or AST construction.

- No embedding-based similarity lookups.

- No probabilistic classifiers for node disambiguation.

- No confidence thresholds influencing emission.

- No inference about "what a Sift event probably meant."

Why this matters:

- PADR-008 (Learning Integration Requirements) does not apply. PADR-008 mandates @complai/glean-sdk integration for any product with an InterpretationEngine. Moment has no InterpretationEngine. The translation layer does not learn, adapt, or degrade based on training data. This holds for Moment Cloud as well — if Moment Cloud later develops AI-assisted features elsewhere (e.g., for specification authoring assistance), those features live outside the translation layer and require their own ADR.

- Determinism is the auditability contract. Every .moment file and every TypeScript artifact must be reproducible from a given (specificationId, sourceEventHead, rule table version) triple. An AI component would break this — the same input could produce different output on different invocations.

- Moment is the deterministic layer in the ecosystem. Sift owns AI-driven specification discovery (ADR-050 AI Integration Pattern). Moment's role is to take what Sift has decided and render it. Sift thinks; Moment renders. Introducing AI into Moment would duplicate Sift's capability and blur the separation of concerns.

What is permitted:

- AI-authored .moment files (by a developer using an AI coding assistant to write DSL manually) — these enter Moment through the standard parser, not through the translation layer. The translation layer does not know or care about their origin.

- AI consumers of Moment's output (e.g., an AI agent using @mmmnt/mcp to read DSL files — [ADR-022](ADR-022-cascade-execution-architecture.md)) — these consume what Moment produces, they don't influence translation.

### Consequences

Positive: Audit trail is complete. Every emitted artifact has a deterministic derivation chain.

Positive: Moment Cloud does not acquire a Glean SDK dependency. Cloud deployment complexity stays bounded.

Positive: Design Principle #15 (independence) is structurally preserved — no AI dependency, no Glean SDK dependency, no runtime dependency on Sift's interpretation outputs.

Negative: When Sift's projection evolves, the translation layer cannot adapt — it must refuse emission until the rule table is extended (D5). This is the intended tradeoff.

## Relationship to ADR-017 (Sift-to-Moment Import Translation)

[ADR-017](ADR-017-sift-to-moment-import-translation.md) and ADR-025 are complementary, not overlapping. Both translate Sift specifications into .moment files. Both use the same deterministic rule table (D3). Both produce byte-identical output for the same specification. They differ only in delivery mechanism:

| Aspect               | [ADR-017](ADR-017-sift-to-moment-import-translation.md) (batch) | ADR-025 (live)                                          |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| Invocation           | moment import --from-sift \<path>                               | Kafka subscription (Cloud) or moment sift watch (CLI)   |
| Input format         | JSONL snapshot (single read)                                    | Event stream (incremental)                              |
| Convergence handling | Assumes snapshot is converged; no gate                          | Active gate (D4) blocks emission on unconverged specs   |
| Schema reconciler    | Runs once after full snapshot fold                              | Runs on every AST build attempt (D5)                    |
| Output cadence       | One-shot write                                                  | Continuous emission on each convergence unlock          |
| Typical user         | Open-source developer bootstrapping from Sift snapshot          | Complai Cloud user with active Sift-Moment subscription |

Shared infrastructure:

- The rule table (D3) is shared. A change to the rule table (via ADR amendment) affects both paths identically.

- The MomentAST type is shared.

- Both emit to the same .moment/ directory structure.

- Both use @mmmnt/emit-ts for TypeScript output (ADR-025 via direct AST feed D6; [ADR-017](ADR-017-sift-to-moment-import-translation.md) via .moment files → parser → AST → emit-ts).

Upgrade path from [ADR-017](ADR-017-sift-to-moment-import-translation.md) to ADR-025.

- A project that uses moment import --from-sift today can switch to moment sift watch when moving to Cloud mode, or use both interchangeably. No migration step.

- The existing moment import --from-sift continues to work against the JSONL snapshot format defined by Sift ADR-052 D3.

## Relationship to Existing Decisions

| Decision                                                                                                                  | Relationship                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PADR-004 (Event Payload Contract v1.6)                                                                                    | Invariant. All events consumed and emitted by the translation layer follow ComplaiEventEnvelope. No new envelope fields.                                                                                                                                                                                                                                                                                     |
| PADR-003 (Federated Router Architecture)                                                                                  | Cold-start GraphQL query (D1) authenticates via the federated router.                                                                                                                                                                                                                                                                                                                                        |
| PADR-008 (Learning Integration Requirements)                                                                              | Does not apply. D7 establishes the translation layer has no InterpretationEngine.                                                                                                                                                                                                                                                                                                                            |
| Moment [ADR-006](ADR-006-manifest-authoring-strategy.md) (Manifest Authoring Strategy)                                    | The .manifest.yaml regenerated on each emission (D6) conforms to [ADR-006](ADR-006-manifest-authoring-strategy.md)'s format.                                                                                                                                                                                                                                                                                 |
| Moment [ADR-008](ADR-008-parser-technology-langium.md) (Parser Technology — Langium)                                      | The MomentAST type produced by the translation layer is the same type Langium produces from parsing .moment files. Output 1 (DSL text, D6) is round-trip-parseable through the Langium parser.                                                                                                                                                                                                               |
| Moment [ADR-017](ADR-017-sift-to-moment-import-translation.md) (Sift-to-Moment Import Translation)                        | Complementary. See dedicated section above. [ADR-017](ADR-017-sift-to-moment-import-translation.md)'s rule mapping remains valid; this ADR operates at a higher abstraction level over the same mappings.                                                                                                                                                                                                    |
| Moment [ADR-021](ADR-021-event-payload-contract.md) (Event Payload Contract — Moment delegate)                            | Governs the events this ADR emits (MomentTranslationCompleted, MomentConvergenceLost, MomentProjectionSchemaMismatch). All follow ComplaiEventEnvelope.                                                                                                                                                                                                                                                      |
| Moment [ADR-022](ADR-022-cascade-execution-architecture.md) (Cascade Execution Architecture)                              | The upstream fingerprint (D2) feeds [ADR-022](ADR-022-cascade-execution-architecture.md)'s drift detection. MomentTranslationCompleted and MomentConvergenceLost events are written to .complai/events/moment/ per [ADR-022](ADR-022-cascade-execution-architecture.md) signaling. moment status ([ADR-022](ADR-022-cascade-execution-architecture.md)) surfaces gate state (D4) and co-evolution debt (D5). |
| Moment [ADR-023](ADR-023-simulation-output-contracts-topology-emission-and-trace-format.md) (Simulation Output Contracts) | Independent. Simulation runs against emitted .moment files; the translation layer's emission cadence (D4) determines when simulation has a new specification to operate on.                                                                                                                                                                                                                                  |
| Sift ADR-052 (Projection Exposure Contract for Moment Consumption)                                                        | Companion. Sift ADR-052 specifies what Sift exposes; this ADR specifies what Moment does with it. Both reference PADR-004 as the envelope invariant. Both evolve independently within the additive-only versioning rule.                                                                                                                                                                                     |

## Cascade Requirements

| Artifact                                                        | Change Required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moment PRD v0.9 (capability section)                            | Add the translation layer as a first-class capability. Weave through @mmmnt/emit-ts, @mmmnt/sync, and @mmmnt/schema package descriptions. Suggested placement: new §5.18 "Live Sift Translation Layer" or extended subsection within §5.9 Ecosystem Relationships child page. Reference this ADR.                                                                                                                                                                                                                                        | Landed in §5.18 Live Sift Translation Layer. PRD bumped to v0.10.                                                                                                                                                                                                                                                                                                                                                |
| Moment PRD v0.9 §5.16 Cross-Product Event Publishing child page | Add MomentTranslationCompleted, MomentConvergenceLost, MomentProjectionSchemaMismatch to the emitted event catalog. Topic: complai.moment.translation.                                                                                                                                                                                                                                                                                                                                                                                   | Landed in §5.16.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Moment PRD v0.9 Appendix B Glossary child page                  | Add: Translation Layer, Schema Reconciler, Convergence Gate, Co-Evolution Debt, MomentSpecificationFold, Direct AST Feed, Rule Table, Projection-to-AST Mapping. Cross-reference Sift PRD glossary.                                                                                                                                                                                                                                                                                                                                      | Landed in Appendix B.                                                                                                                                                                                                                                                                                                                                                                                            |
| Moment PRD v0.9 §5.9 Ecosystem Relationships child page         | Update Sift row to note the translation layer (this ADR) operates over the projection exposure contract (Sift ADR-052). Relationship remains "Upstream supplier (Conformist)".                                                                                                                                                                                                                                                                                                                                                           | Landed in §5.9.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Moment Domain Specification (next pass)                         | Add a TranslationLayer bounded context (or extend Specification Parsing context, as appropriate). Verify MomentSpecificationFold, SchemaReconciliationNote, EmissionGateState are modeled as value objects. New commands: FoldEvent, RecordConvergence, LoseConvergence, ReconcileSchema, EmitTranslation. New events already listed in D4 and D5.                                                                                                                                                                                       | Landed in Domain Specification Pass 4 (Translation Layer Addendum) (2026-04-19). Decision: new TranslationLayer BC (GR-4.01). Aggregate: MomentSpecificationFold as sole root with EmissionGateState and SchemaReconciliationReport embedded VOs (GR-4.02). Unified SiftEventSourceAdapter domain service (GR-4.03). Ten new invariants TL-01 through TL-10. Gap Report Pass 4: converged, 0 errors, 0 warnings. |
| Moment ADR Index                                                | Register ADR-025 in the registry table. Update "Next available" to [ADR-026](ADR-026-oauth-device-flow-github-app-authentication-for-moment-cli.md). Add a Cascade Dependencies row: ADR-025 → [ADR-017](ADR-017-sift-to-moment-import-translation.md) (complementary), ADR-025 → [ADR-021](ADR-021-event-payload-contract.md) (event emission), ADR-025 → [ADR-022](ADR-022-cascade-execution-architecture.md) ([ADR-022](ADR-022-cascade-execution-architecture.md) consumes ADR-025's translation events for cascade classification). | Landed in the Moment ADR Index.                                                                                                                                                                                                                                                                                                                                                                                  |
| @mmmnt/emit-ts public API                                       | Add emitFromAST(ast: MomentAST): TypeScriptOutput entry point (D6). Document as part of the public contract.                                                                                                                                                                                                                                                                                                                                                                                                                             | Engineering — outside DDD cascade scope.                                                                                                                                                                                                                                                                                                                                                                         |
| @mmmnt/core rule table                                          | Implement the initial rule table (D3). One function per projection node type. Property-based tests verify equivalence between the batch import path ([ADR-017](ADR-017-sift-to-moment-import-translation.md)) and the live path (this ADR) for a shared test corpus.                                                                                                                                                                                                                                                                     | Engineering — outside DDD cascade scope.                                                                                                                                                                                                                                                                                                                                                                         |

## Scope Boundary — What This ADR Does NOT Do

- It does not modify the event envelope. PADR-004 v1.6 is invariant.

- It does not specify Sift's projection schema. That is Sift ADR-052's concern. This ADR consumes what Sift ADR-052 exposes.

- It does not replace [ADR-017](ADR-017-sift-to-moment-import-translation.md). Both ADRs coexist. See the dedicated section above.

- It does not address the Event Storming timeline schema. Blocked on SIFT-1. D3 reserves the FlowNode rule slot but does not define its rule function.

- It does not introduce AI capability. D7 is explicit — no AI, anywhere, in this layer.

- It does not alter Moment's open-source packages' independence. Design Principle #15 preserved — the translation layer is a Cloud-mode capability; CLI mode operates over JSONL exports without any live Sift dependency.

- It does not specify @mmmnt/sync behavior. Sync operates on emitted artifacts (TypeScript, .moment files); it does not interact with the translation layer directly. The cascade path is: translation emits → sync detects drift → sync proposes specification updates back to the developer.

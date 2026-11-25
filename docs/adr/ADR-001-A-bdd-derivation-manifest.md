# ADR-001-A: BDD Derivation Manifest

Migrated from Confluence page 11665410 (version 3, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/11665410. The Confluence space is private; this file is now the record.

Migrated from Sift: This ADR originated as Sift ADR-035-A (child of Sift ADR-035). Migrated to the Moment space March 2026 when the Moment Specification Language was established as an independent project.

- **Parent:** [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md): Event Manifest, Moment DSL & Visualization Pipeline
- **Status:** Proposed
- **Sift Origin:** ADR-035-A
- **Date:** March 6, 2026
- **Purpose:** Complete mapping from every Moment DSL construct to its BDD test output. This is the generation specification — every construct the DSL exposes has exactly one derivation rule.

## 1. Suite Topology

The generator produces three categories of test output from a single Moment DSL file, organized by bounded context (ducks pattern) with cross-cutting moment orchestrators at the top level.

| Category            | Location             | Source                                                                      | Purpose                                                                 |
| ------------------- | -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Behavior Suite      | {context}/behaviors/ | moment entries scoped to context lane                                       | Verifies event chain behavior within a single context                   |
| Contract Suite      | {context}/contracts/ | crosses-to declarations where context is a party                            | Verifies this context's obligations at cross-context boundaries         |
| Schema Suite        | {context}/schemas/   | Manifest entries of kind event, sagaEvent, coachingEvent emitted by context | Validates payload shape against manifest                                |
| Moment Orchestrator | moments/             | moment declaration                                                          | Cross-cutting choreography — sequences and imports from context modules |

### Dependency Graph

```
Schema Suite (leaf — no dependencies)
    ▲
    │ imported by
    │
Behavior Suite ───imports───▶ own context schemas
    ▲
    │ imported by
    │
Contract Suite ───imports───▶ source + target context schemas
    ▲
    │ imported by
    │
Moment Orchestrator ───imports───▶ Behavior + Contract from each traversed context
```

### File Layout

```
__tests__/
├── ingestion/
│   ├── schemas/
│   │   ├── input-source-registered.schema.ts
│   │   ├── normalization-completed.schema.ts
│   │   ├── document-parsing-failed.schema.ts
│   │   ├── input-sufficiency-failed.schema.ts
│   │   ├── input-processing-stalled.schema.ts
│   │   └── ...
│   ├── contracts/
│   │   ├── interpretation.partnership.ts
│   │   └── refinement.conformist-upstream.ts
│   └── behaviors/
│       ├── normalization-pipeline.test.ts
│       ├── input-coaching.test.ts
│       └── parsing-failure.test.ts
├── interpretation/
│   ├── schemas/
│   │   ├── candidate-registered.schema.ts
│   │   ├── interpretation-completed.schema.ts
│   │   └── ...
│   ├── contracts/
│   │   ├── ingestion.partnership.ts
│   │   └── model-registry.customer-supplier.ts
│   └── behaviors/
│       └── candidate-registration.test.ts
├── model-registry/
│   ├── schemas/ ...
│   ├── contracts/ ...
│   └── behaviors/ ...
├── structural-analysis/
│   ├── schemas/ ...
│   ├── contracts/ ...
│   └── behaviors/ ...
├── refinement/
│   ├── schemas/ ...
│   ├── contracts/ ...
│   └── behaviors/ ...
├── schema-governance/
│   ├── schemas/ ...
│   ├── contracts/ ...
│   └── behaviors/ ...
└── moments/
    ├── moment-a-first-time-document-ingestion.test.ts
    ├── moment-b-revision-detection.test.ts
    ├── moment-c-refinement-session.test.ts
    └── moment-d-specification-lifecycle.test.ts
```

Structural principle: Every context folder is self-contained. Open ingestion/ and you see everything Ingestion is responsible for — its event schemas, its contractual obligations to every partner, and its internal behavioral assertions. Moment files are choreography tests — they don't own assertions, they sequence and import them from context modules.

## 2. DSL Construct → BDD Derivation Rules (Complete)

### 2.1 moment "\<n>"

Derivation: Top-level describe() block in a moment orchestrator file. One moment spec = one file in moments/. Name slugified for filename. The orchestrator imports behavioral and contract modules from each context it traverses — it does not define assertions inline. All moment blocks become direct children.

### 2.2 lane \<id> "\<label>" [\<classification>]

Derivation: No direct BDD output. Lanes are metadata consumed by the generator for name resolution (which context does NormalizationCompleted belong to?), output file routing, and contract suite file routing. Validation: Every \<lane>: reference must resolve to a declared lane or branch-lane.

### 2.3 branch-lane \<id> "\<label>" [\<classification>]

Derivation: No direct BDD output. Same role as lane but marks the lane as a branch path. Used for determining which when blocks route to alternative paths and marking assertions as conditional.

### 2.4 moment "\<text>"

Derivation: Nested describe() block inside the moment orchestrator. Moments are ordered — emitted in declaration order. A moment with no entries is a validation error. The moment's entries determine which context modules are imported.

### 2.5 moment "\<text>" [branch]

Derivation: describe() block with conditional child blocks from when clauses. Entries before any when are unconditional. Each when block becomes a child describe(). The set of when conditions must be exhaustive per the manifest's branchConditions.

### 2.6 moment "\<text>" [branch, \<lane>]

Derivation: Same as [branch] but the generator validates all when blocks are scoped to the specified lane or its downstream lanes.

### 2.7 \<lane>: \<manifest-entry>

Derivation: Core assertion atom. What it produces depends on the manifest entry kind (see §3). Assertions generated into the context folder determined by the lane. The entry name must resolve to exactly one ManifestEntry via the lane's context. The moment orchestrator imports and invokes this assertion.

### 2.8 \<lane>: \<manifest-entry> (×N)

Derivation: Multiplicity modifier. (×N) means 1..\* — at least one, possibly many. The assertion validates ALL emitted instances against the schema. correlationId consistency asserted across the batch.

### 2.9 \<lane>: \<manifest-entry> [optional]

Derivation: Conditional assertion — the entry may or may not occur. IF event is emitted, assert payload conforms; absence is not a failure. Rules: Optional entries cannot be the sole entry in a moment. Optional entries cannot carry crosses-to.

### 2.10 \<lane>: \<manifest-entry> [terminal]

Derivation: Terminal state marker. Adds post-condition assertions: event emitted, payload conforms, no further events in this context, saga terminal state (if applicable). [terminal] entries must be the last in their branch path.

### 2.11 \<lane>: saga \<state>

Derivation: Saga state transition assertion. The saga is identified by lane + context via the manifest. Saga state transitions are ordering assertions verifying temporal sequencing.

### 2.12 "\<text>" (indented inline description)

Derivation: No BDD output. Preserved as comments in generated test for readability.

### 2.13 crosses-to \<lane> via \<relationship>

Derivation: Produces output in two locations:

A) Source context's contracts/ folder — this context's obligations (contract verification function).

B) Moment orchestrator — a contract reference that imports and invokes the contract verification.

Rules: crosses-to must be indented under an event entry. The parent event is the "crossing event." Invalid on commands, saga states, or inline descriptions. Multiple crosses-to on the same event are valid. Invalid on [optional] entries. Contract file lives in source context's contracts/ folder named {target}.{relationship}.ts.

### 2.14 triggered-by \<manifest-entry>

Derivation: Causal chain assertion. Asserts causationId traces to the referenced entry's eventId and temporal ordering. The referenced entry must appear earlier in the moment spec. If in a different context, an implicit crossing is inferred and validated.

### 2.15 returns-to "\<moment-name>"

Derivation: Cycle assertion. Asserts the emitted event triggers the same entry point as the referenced moment, causationId links the cycle-back, and a new correlation scope (fresh correlationId) is established. The referenced moment must exist earlier. The generator does NOT unroll the cycle.

### 2.16 triggers \<manifest-entry>

Derivation: Forward causal assertion. Inverse of triggered-by. If used together on the same pair, the generator deduplicates. Can reference a saga, policy, or command.

### 2.17 when \<condition>

Derivation: Branch condition block. Only valid inside [branch] moments. Condition must match a branchConditions[].condition value. All conditions must have corresponding when blocks (exhaustiveness).

### 2.18 when \<condition> [\<lane>]

Derivation: Same as when \<condition> but routes into a specific branch-lane.

## 3. Manifest Entry Kind → Assertion Shape

When the generator encounters \<lane>: \<manifest-entry>, it resolves the entry's kind from the manifest and dispatches to the appropriate assertion template.

| Kind          | Primary Assertion                                       | Schema Assertion                   | Causal Assertion                              | Ordering Assertion                  |
| ------------- | ------------------------------------------------------- | ---------------------------------- | --------------------------------------------- | ----------------------------------- |
| command       | Command issued to correct aggregate                     | N/A                                | causationId traces to triggering event/policy | Must follow its trigger             |
| event         | Event emitted from correct aggregate in correct context | Payload matches manifest schema    | Carries causationId, correlationId            | Must follow producing command       |
| sagaEvent     | Event emitted by saga (not aggregate)                   | Payload matches manifest schema    | Carries saga's correlationId                  | Must follow saga's preceding state  |
| coachingEvent | Event emitted within coaching session scope             | Payload matches manifest schema    | sessionId links to session start              | Ordered within session sequence     |
| policy        | Policy activates in response to trigger event           | N/A                                | Links trigger event to resulting command      | Must follow trigger, precede result |
| saga          | Saga state transition occurs                            | State value matches expected       | Transition linked to triggering event         | Must follow trigger event           |
| projection    | Projection updated with new state                       | Shape matches manifest declaration | Consumes triggering event(s)                  | Eventually consistent               |
| process       | Process/engine executes                                 | N/A                                | Links to upstream event and downstream result | Must follow input, precede output   |
| action        | User/external action occurs                             | N/A                                | Initiates new causal chain (root causation)   | Entry point — no predecessor        |
| branch        | Branch point evaluates                                  | N/A                                | Links to evaluated event                      | Precedes all when block entries     |
| terminal      | Terminal state reached, no further events               | Payload matches manifest schema    | Final causationId in chain                    | Last in its path                    |

Compound modifiers: event + (×N) → batch assertion with shared correlationId. event + [optional] → conditional assertion. event + [terminal] → terminal assertion added to standard event assertion. sagaEvent + [terminal] → saga terminal state + no-further-events. command + triggered-by → causal chain through policy. policy (implicit) → when an event crosses-to another context, the activating policy is resolved from manifest consumer relationships.

## 4. Relationship Type → Contract Suite Structure

### 4.1 Partnership

Bidirectional dependency. Both sides are contract parties. Generated into both contexts' contracts/ folders. Source context gets emission obligations. Target context gets reception obligations and bidirectional invariants (correlationId sharing, bilateral schema governance). Partnership contracts populate BOTH folders.

### 4.2 Customer-Supplier

Unidirectional. Supplier's emission is the contract. Only the supplier context gets behavioral assertions (required fields, causal ordering, schema versioning). The customer context gets only a schema conformance re-export documenting the dependency.

### 4.3 Conformist

No negotiable contract. The conformist context gets minimal output — only schema conformance validation, no behavioral assertions. The upstream context gets nothing.

### 4.4 Open Host Service / Published Language

Broadcast contract. Schema IS the contract. Publishing context's contracts/ gets schema validation assertions plus per-consumer compatibility blocks. Consumer list derived from manifest ConsumerRef entries.

## 5. Composition Rules

### 5.1 Causal Chain Resolution

When the generator encounters a sequence of entries within a moment, it infers causal ordering. Each it() block within a moment has an implicit dependency on the preceding it() block. All assertions land in the owning context's behaviors/.

### 5.2 Cross-Moment Dependencies

Moments are ordered but do not imply direct causal links unless connected by triggered-by, triggers, or crosses-to. The generator validates all forward/backward references resolve correctly.

### 5.3 Branch Exhaustiveness

For any [branch] moment: identify branching entry, collect when conditions, validate against manifest's branchConditions, emit validation error if any condition is missing.

### 5.4 Contract Accumulation

Contract suites are accumulated across moment specs within each context folder. Multiple moment specs declaring crossings between the same context pair contribute to the SAME contract file. Contract suites are the union of all crossing declarations. Adding a new moment spec that traverses existing contexts requires zero changes to context folders.

### 5.5 Schema Suite Generation

Every manifest entry of kind event, sagaEvent, or coachingEvent gets a Zod schema validator in its owning context's schemas/ folder. Schema suites are leaf dependencies — they import nothing from behavior or contract suites. Both behavior and contract suites import from schema suites. Consumers import across context boundaries.

### 5.6 Deduplication

Same event crosses-to same target in two moment specs → single contract assertion, both orchestrators reference it. triggers X + X triggered-by Y (same pair) → single causal assertion. Same event in multiple moments → single schema validator, multiple behavioral assertions import it. Same saga state transition in different branches → one assertion per unique (saga, fromState, toState) tuple.

## 6. Validation Rules (Complete)

| #   | Rule                                                                                                     | Level   |
| --- | -------------------------------------------------------------------------------------------------------- | ------- |
| V1  | Every entry name resolves to exactly one ManifestEntry via lane context                                  | Error   |
| V2  | Every crosses-to target lane is a declared lane (not branch-lane)                                        | Error   |
| V3  | Every when condition matches a branchConditions[].condition from the manifest                            | Error   |
| V4  | All branchConditions for a branching entry have corresponding when blocks                                | Error   |
| V5  | Every triggered-by reference resolves to an entry in a prior moment                                      | Error   |
| V6  | Every returns-to reference resolves to a prior moment by name                                            | Error   |
| V7  | [optional] entries do not carry crosses-to                                                               | Error   |
| V8  | [terminal] entries are last in their branch path                                                         | Error   |
| V9  | crosses-to is only valid on entries of kind event, sagaEvent, coachingEvent                              | Error   |
| V10 | A moment with zero entries is invalid                                                                    | Error   |
| V11 | (×N) is only valid on entries of kind event, sagaEvent, coachingEvent                                    | Error   |
| V12 | saga \<state> resolves to a declared saga in the lane's context                                          | Error   |
| V13 | Lane references resolve to declared lane or branch-lane                                                  | Error   |
| V14 | Partnership crossings must have corresponding obligations from both directions (across all moment specs) | Warning |
| V15 | Every manifest event of kind event appears in at least one moment spec                                   | Warning |
| V16 | branch-lane is referenced by at least one when block                                                     | Warning |
| V17 | Cycle detection: returns-to does not create an infinite unroll (generator caps at depth 1)               | Warning |

## 7. Moment Orchestrator Pattern

The moment orchestrator is the key composition mechanism. It imports from context modules and sequences them into the narrative flow. Each describe corresponds to a moment, each import corresponds to a lane entry. The actual assertion logic lives in the context modules.

Principle: Adding a new moment spec that traverses existing contexts requires zero changes to context folders. Behavioral assertions are tested once, referenced many times. Contract assertions accumulate but are never duplicated. The moment file is the human-readable choreography of the domain flow.

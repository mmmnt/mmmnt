# ADR-017: Sift-to-Moment Import Translation

Migrated from Confluence page 20545550 (version 2, last updated 2026-04-18), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/20545550. The Confluence space is private; this file is now the record.

- **Status:** Proposed (partially blocked — temporal event schemas depend on SIFT-1)
- **Version:** 1.1
- **Date:** March 13, 2026 (v1.0); April 17, 2026 (v1.1 cross-reference)
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** @mmmnt/core, sift, import, event-storming, batch-path
- **Gap Report Ref:** MG-07 (Pass 3), Domain Specification v5–v9
- **Depends On:** SIFT-1 (Sift temporal event schema definitions)
- **Companion ADRs:** [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md): Translation Layer Architecture — Live Sift Projection Consumption (live streaming counterpart), Sift ADR-052: Projection Exposure Contract for Moment Consumption (producer-side contract this ADR now consumes)

## v1.1 Amendment (2026-04-17) — Relationship to ADR-025 and Sift ADR-052

This ADR governs the batch Sift-to-Moment translation path — the one-shot snapshot conversion invoked via moment import --from-sift \<path>. It remains the authoritative decision record for that path.

Two complementary ADRs have since been published that together bound the full Sift consumption story:

- Moment [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) (2026-04-17) governs the live streaming path — continuous Kafka subscription (Cloud) or incremental JSONL watching (CLI) via moment sift watch. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) introduces the MomentSpecificationFold internal representation, a convergence gate that blocks emission until Sift signals SpecificationConverged, and a schema reconciler that surfaces co-evolution debt as observable state. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) and ADR-017 are complementary, not overlapping — they share the same projection-to-AST rule table in @mmmnt/core ([ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) D3) and produce byte-identical .moment output for the same specification. They differ only in delivery mechanism and convergence handling ([ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) has the gate; ADR-017 assumes the snapshot is already converged).

- Sift ADR-052 (2026-04-17) defines what Sift exposes for both paths: a folded projection (DSL-buildable subset of the event stream), query-surface parity across Cloud (GraphQL subgraph) and CLI (JSONL export) modes, and convergence signaling events. The JSONL export format defined by Sift ADR-052 D3 is now the canonical source format this ADR's batch path consumes. No code change is required on either side — the contract is consistent. The prior framing in this ADR's "Source" subsection (.domain/ JSONL files or Kafka topic snapshot) is superseded in favor of the structured JSONL export directory described in Sift ADR-052 D3 (projection.json root + events/ subdirectory + manifest.json).

Shared infrastructure with [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md). The rule table that maps projection nodes to AST nodes lives in @mmmnt/core ([ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) D3) and is shared between both paths. The SiftSpecificationImporter defined in this ADR now delegates to that shared rule table rather than implementing its own mapping. A change to a rule function affects both paths identically. Property-based tests in @mmmnt/core verify equivalence for a shared test corpus. See Moment PRD §5.18.5 for the rule table definition and §5.18.10 for the explicit relationship between the two paths.

Upgrade path. A project using moment import --from-sift today can switch to moment sift watch when moving to Cloud mode, or use both interchangeably. No migration step; this ADR's command continues to work against the JSONL snapshot format defined by Sift ADR-052 D3.

What this amendment does NOT change.

- The core translation mapping defined below (Phase 1 Building Block + Phase 2 Event Storming Timeline) remains authoritative. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)'s rule table implements this mapping at the projection-node level — a higher-fidelity abstraction that produces the same end state.

- SIFT-1 dependency is unchanged — the Phase 2 temporal mapping remains blocked on Sift's Event Storming event schemas. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) inherits this dependency: its FlowNode rule slot is also reserved pending SIFT-1.

- Design Principle #15 (Moment independence) remains preserved — the importer is still an optional code path in @mmmnt/core with zero runtime or build-time dependency on Sift.

- No-merge constraint is unchanged — re-importing still overwrites previous imports.

## Context

Moment is an open-source domain specification language and implementation toolchain. Its primary input path is hand-authored .moment DSL files — a developer learns the grammar, writes specifications, and gets the full pipeline without any external dependency. This is Design Principle #15.

For Complai users, a second input path exists: Sift produces domain specifications through AI-driven analysis. Sift automates Event Storming per Alberto Brandolini's methodology — it establishes bounded contexts, aggregates, commands, events, invariants, context relationships, and the Event Storming timeline narrative (command→event chains, policy/reaction triggers across boundaries, read model dependencies). This is a complete domain specification covering both the DDD building block inventory and the behavioral choreography.

Moment needs to consume Sift's output and translate it into .moment DSL files. This translation must be:

- Structural — a deterministic mapping from Sift event schemas to Moment DSL syntax. No AI, no inference, no heuristics.

- Optional — Moment must function identically whether .moment files are hand-authored or Sift-imported. The pipeline cannot distinguish between the two.

- Complete — the import must produce both spatial files (.moment/contexts/) and Event Storming timeline files (.moment/flows/) plus the .manifest.yaml.

- Round-trip correct — every imported file must pass MomentParser validation without errors.

- Idempotent — same Sift event stream always produces byte-identical output.

The question is: what is the translation mapping, where does it live, and what are the interface boundaries?

## Decision

### SiftSpecificationImporter in @mmmnt/core

The import translation is a domain service (SiftSpecificationImporter) in the Specification context (@mmmnt/core). It lives in core because it produces .moment files — and the grammar, the parser, and the file format are all core responsibilities. The CLI exposes it as moment import --from-sift \<source>.

Why core, not a separate package: The importer needs intimate knowledge of the .moment grammar to produce syntactically valid files. Placing it in a separate @mmmnt/import package would either duplicate grammar knowledge or create a circular dependency on core. Since the importer is an optional code path (never invoked unless the user explicitly calls it), the coupling cost is zero — it's dead code for open-source users who never touch Sift.

Why not CLI: The CLI is an application orchestration layer. The translation logic is domain logic — mapping DDD building blocks to DSL constructs requires understanding the grammar's structural rules, not just wiring packages together.

v1.1 note: The translation rule table is now shared with [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)'s live path. The importer invokes the same pure rule functions (buildContextDeclaration, buildAggregateBlock, etc.) that the live translation layer uses. This guarantees byte-identical output across paths.

### Two-Phase Translation

The import operates in two phases:

Phase 1 — Building Block Translation (spatial)

Sift events map to .moment/contexts/{context-name}.moment files. One file per bounded context. The mapping is direct:

| Sift Event                     | Moment DSL Construct                 | Location             |
| ------------------------------ | ------------------------------------ | -------------------- |
| BoundedContextDefined          | context block declaration            | File-level container |
| AggregateAdded                 | aggregate block within context       | Nested in context    |
| CommandDefined                 | command declaration within aggregate | Nested in aggregate  |
| EventDefined                   | event declaration within aggregate   | Nested in aggregate  |
| ValueObjectDefined             | valueobject declaration              | Nested in aggregate  |
| InvariantDefined               | invariant declaration                | Nested in aggregate  |
| PolicyDefined                  | policy declaration                   | Nested in context    |
| SagaDefined                    | saga declaration                     | Nested in context    |
| ProjectionDefined              | projection declaration               | Nested in context    |
| ContextRelationshipEstablished | relationship declaration             | Context-level        |

Each building block also generates a corresponding .manifest.yaml entry with metadata (description, consumers, ADR references, payload schemas) that the DSL syntax cannot express.

Phase 2 — Event Storming Timeline Translation

Sift's Event Storming output events map to .moment/flows/{flow-name}.moment files. One file per cross-context flow. The mapping follows Brandolini's Event Storming building blocks:

| Sift Event Storming Artifact | Moment DSL Construct                          | Notes                               |
| ---------------------------- | --------------------------------------------- | ----------------------------------- |
| Domain event on timeline     | node in a frame                               | Orange sticky → positioned in lane  |
| Command triggering event     | command-node preceding event node             | Blue sticky                         |
| Aggregate handling command   | Lane assignment (swimlane)                    | Yellow sticky → lane identity       |
| Policy / Reaction            | connection from event to command across lanes | Lilac sticky → cross-boundary arrow |
| Read Model                   | readmodel-node                                | Green sticky (if modeled)           |
| Hotspot                      | hotspot annotation                            | Pink sticky → flagged for review    |
| Swimlane                     | lane declaration                              | Bounded context grouping            |
| Chronological ordering       | Left-to-right frame sequence                  | Timeline position                   |

Exact Sift temporal event names are TBD — blocked by SIFT-1. The Sift domain specification fresh pass will define these events. This ADR establishes the mapping contract; the specific event schemas will be added as an amendment when SIFT-1 is resolved. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) reserves the corresponding FlowNode rule slot pending the same SIFT-1 resolution.

### Import Behavior

- Source: JSONL snapshot directory produced by sift export --projection per Sift ADR-052 D3 (v1.1 amendment). The structure is: projection.json (SpecificationProjection root) + events/{eventId}.json (individual events) + manifest.json (projection version, source event head, export timestamp). The source format is Sift's Published Language — Moment conforms.

- Output directory: .moment/contexts/ (spatial), .moment/flows/ (temporal), .manifest.yaml (metadata).

- No merge: The import does not merge with existing hand-authored files. It writes to the output paths and replaces any existing imported files. A future merge strategy is a V2 concern.

- Validation gate: After writing all files, the importer invokes MomentParser.ParseMomentFile on every generated file. If any file fails validation, the import aborts and reports the parser errors. This enforces SI1 (round-trip correctness).

- Warnings: Sift events with no Moment DSL equivalent (e.g., deployment-specific concerns, infrastructure-level decisions) are logged as warnings in the ImportResult, not silently dropped.

- Idempotency: Enforced by SI2 — deterministic file generation with stable ordering (contexts alphabetical, building blocks by creation order from event stream).

### Interface Boundaries

| Boundary                          | Owner                                                                                                          | Contract                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Sift folded projection schema     | Sift (ADR-052 D2)                                                                                              | Published Language — Moment conforms                                                                                                       |
| Sift specification event schemas  | Sift (ADR-044)                                                                                                 | Underlying envelope — preserved in projection events                                                                                       |
| Sift Event Storming event schemas | Sift (SIFT-1)                                                                                                  | Published Language — Moment conforms                                                                                                       |
| JSONL export format               | Sift (ADR-052 D3)                                                                                              | Canonical batch-path source format                                                                                                         |
| .moment grammar                   | Moment (@mmmnt/core)                                                                                           | Moment owns the grammar; importer produces valid syntax                                                                                    |
| .manifest.yaml format             | Moment (@mmmnt/core, [ADR-006](ADR-006-manifest-authoring-strategy.md))                                        | YAML schema per [ADR-006](ADR-006-manifest-authoring-strategy.md)                                                                          |
| Projection-to-AST rule table      | Moment (@mmmnt/core, [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) D3) | Shared between this ADR's batch path and [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md)'s live path |
| Translation mapping (spec-level)  | This ADR (017)                                                                                                 | Governs the structural mapping between Sift domain concepts and Moment DSL                                                                 |

### Independence Constraint (Design Principle #15)

The SiftSpecificationImporter exists in @mmmnt/core as an optional domain service. It introduces zero runtime or build-time dependencies on Sift or any Complai service. The importer reads a generic event stream (JSONL or Kafka snapshot) — the Sift event schemas are data contracts, not library imports. If a developer never calls moment import --from-sift, no Sift-related code path is exercised.

The @mmmnt/core package must pass all tests and all quality gates with the importer present but never invoked. This is the litmus test for independence.

## Consequences

What becomes easier:

- Complai users get a zero-friction path from Sift specification to Moment pipeline — no manual DSL authoring required

- The import produces files indistinguishable from hand-authored ones, so all downstream tooling (derive, generate, emit-ts, sync) works identically

- Event Storming output from Sift flows directly into Moment's temporal modeling, closing the gap between specification and implementation

- v1.1: Rule table sharing with [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) means bugs fixed on one path are automatically fixed on the other. A new node type supported on the live path also works on the batch path without additional work.

What becomes harder:

- The importer must track Sift's event schema evolution — if Sift adds new building block types, the importer needs updates. v1.1: This is now governed by ADR-052's additive-only projection versioning rule (D5) — Moment's rule table extensions are tracked via ADR amendments, not ad-hoc code changes.

- No merge strategy means re-importing overwrites previous imports — manual edits to imported files are lost. The mitigation is: don't edit imported files; edit the Sift specification and re-import.

- The Phase 2 mapping is partially blocked until SIFT-1 defines the temporal event schemas. [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) inherits the same block.

What to watch:

- Whether SIFT-1's Event Storming output aligns cleanly with the Moment DSL's temporal constructs (lanes, frames, nodes, connections). If there's a mismatch, the mapping table in this ADR will need revision.

- Community demand for other import sources — ContextMapper CML (mentioned in [ADR-006](ADR-006-manifest-authoring-strategy.md)'s post-V1 roadmap) follows the same pattern: external format → structural translation → .moment files

- Whether the no-merge constraint is acceptable long-term — teams that mix hand-authored and Sift-imported flows will need a merge strategy eventually

## Alternatives Considered

1. Sift writes .moment files directly (rejected): Sift could include the Moment grammar and produce .moment files without an intermediate event format. Rejected because this couples Sift to the Moment grammar — every grammar change requires a Sift deployment. The event-based contract decouples the two products.

2. Separate @mmmnt/import package (rejected): Isolating the importer in its own package was considered to keep core pristine. Rejected because the importer needs grammar knowledge that lives in core, and a separate package either duplicates that knowledge or creates a dependency cycle. The importer as an optional service in core is cleaner.

3. Import at the IR level instead of DSL level (rejected): The importer could produce MomentData IR directly (bypassing the grammar) and feed it to Derivation. Rejected because this creates two pipeline entry points — one from the parser, one from the importer — which doubles the validation surface. Producing .moment files and running them through the standard parser ensures SI1 (round-trip correctness) and means every downstream consumer sees identical data regardless of origin.

4. AI-powered inference in the importer (rejected): The importer could use AI to infer temporal flows from the spatial model when Sift doesn't provide Event Storming data. Rejected because this would duplicate Sift's AI capability in Moment, violating the separation of concerns. Sift does the thinking; Moment does the rendering. If Event Storming data is missing, the developer hand-authors the temporal flows — that's the open-source path working as designed.

5. Single consumption path — merge batch into live or vice versa (rejected, v1.1): When [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) was drafted, the option of collapsing this ADR's batch path into the live streaming path was considered. Rejected — the two paths serve genuinely different use cases (open-source developer bootstrapping from a snapshot vs. Complai Cloud user with active Sift-Moment subscription). Collapsing would either force open-source users to implement Kafka consumption or force Cloud users through a one-shot invocation that loses the convergence gate. Keeping both paths with shared infrastructure (rule table, AST type, file layout) gives the right ergonomics per context.

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-03-13 | Initial publication. Establishes SiftSpecificationImporter in @mmmnt/core, two-phase translation (building blocks + Event Storming timeline), interface boundaries, Design Principle #15 independence constraint, and the moment import --from-sift CLI command. Partially blocked on SIFT-1 for Phase 2 temporal event schemas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.1     | 2026-04-17 | Cross-reference amendment for [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) and Sift ADR-052. Companion ADRs field added. v1.1 Amendment section inserted at top documenting the complementary relationship with [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) (live streaming path) and the canonical source format defined by Sift ADR-052 D3 (JSONL export directory). Source subsection updated to reference the ADR-052 D3 export format. Interface Boundaries table extended with four new rows (folded projection schema, JSONL export format, event envelope, projection-to-AST rule table) linking to the producer-side and consumer-side ADRs. Rule table sharing with [ADR-025](ADR-025-translation-layer-architecture-live-sift-projection-consumption.md) documented. New alternative (#5) added recording the decision to keep batch and live paths separate with shared infrastructure. No changes to the core mapping logic, Design Principle #15 constraint, or SIFT-1 dependency. |

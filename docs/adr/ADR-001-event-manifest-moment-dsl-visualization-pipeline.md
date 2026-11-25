# ADR-001: Event Manifest, Moment DSL & Visualization Pipeline

Migrated from Confluence page 11337752 (version 2, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/11337752. The Confluence space is private; this file is now the record.

Migrated from Sift: This ADR originated as Sift ADR-035. Migrated to the Moment space March 2026 when the Moment Specification Language was established as an independent project.

- **Status:** Proposed
- **Release:** R6
- **Date:** March 6, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Sift Origin:** ADR-035
- **Tags:** client-app:spec-view

## Context

Sift produces domain specifications as event-sourced entities. The specification's building blocks — commands, events, policies, sagas, projections, aggregates, and their cross-context relationships — are fully described in the domain specification, architecture palette, and governing ADRs. However, no single artifact today provides:

- A canonical event manifest — a structured registry of every building block with its metadata (owning aggregate, owning context, governing ADRs, cross-context consumers, branch conditions, terminal states) in a machine-readable format.

- A narrative description of user journeys — the chronological, branching event chains that describe what happens when an architect interacts with the system, expressed in a human-readable domain-specific language.

- A visualization pipeline — a generator that joins the manifest and moment descriptions to produce interactive visual artifacts (timeline swimlane view + sequential card view) and behavioral assertion contracts.

The event manifest is currently implicit — distributed across the domain specification document, the architecture palette, and individual ADRs. Moment flows are understood but not formalized. Visualization is ad-hoc.

Additionally, Complai Seam consumes Sift's .domain/ event stream (ADR-025) and synchronizes it to TypeScript. There is no formal mechanism today to verify that the synchronized implementation actually behaves according to the specification. A moment DSL that describes expected event chains would provide Seam with BDD-style assertion contracts — closing the loop between specification and implementation.

## Decision

### 1. Event Manifest

The event manifest is a structured registry of every building block in a domain specification. It serves as the "encyclopedia" — the complete metadata layer that the Moment DSL references by name.

For customer domain models: The manifest is a runtime projection from SpecificationRoot's event stream. As spec events are applied (ContextDefined, AggregateAdded, DomainEventDefined, PolicyDeclared, etc.), the manifest projection materializes the complete building block registry. This is a shaped view of SpecificationStateView optimized for moment resolution.

For internal models (Sift, Seam, Forge): The manifest is an authored document maintained alongside the domain specification, validated by a generator that cross-references the domain specification and governing ADRs. This is a bootstrapping necessity — Sift cannot process its own domain spec through its own pipeline until it exists. The authored manifest uses the same schema as the runtime projection.

Manifest Entry Schema:

```
type ManifestEntry = {
  id: string;                            // Fully qualified: "{context}.{aggregate}.{name}"
  kind: "command" | "event" | "sagaEvent"
      | "coachingEvent" | "policy" | "saga"
      | "projection" | "process" | "action"
      | "branch" | "terminal";
  name: string;                          // Display name
  context: string;                       // Owning bounded context
  aggregate?: string;                    // Owning aggregate (if applicable)
  description: string;                   // Human-readable detail
  payload?: Record<string, string>;      // Field names → type descriptions
  adrs: string[];                        // Governing ADR references
  consumers: ConsumerRef[];              // Cross-context consumers
  producedBy?: string;                   // Upstream trigger (manifest entry ID)
  terminal?: boolean;                    // Terminal state marker
  branchConditions?: BranchCondition[];  // Downstream branch outcomes
  multiplicity?: "single" | "per-item";  // Whether this fires once or N times
};

type ConsumerRef = {
  context: string;
  component: string;  // Policy, saga, or projection name
  relationship: string; // Partnership, Customer-Supplier, etc.
};

type BranchCondition = {
  condition: string;   // "success", "failure", "pass", "fail", etc.
  target: string;      // Manifest entry ID of the downstream node
  path?: string;       // Branch lane ID (for visualization)
};
```

Validation: A generator cross-references the manifest against the domain specification and ADR index. Validation rules:

- Every manifest entry must map to a building block in the domain specification

- Every ADR reference must exist in the ADR index

- Every cross-context consumer must have a corresponding context relationship in the domain specification

- Every event must have at least one consumer (policy, saga, projection, or architect)

- Every command must have at least one producing trigger (policy, saga, user action, or upstream event)

- Branch conditions must cover all outcomes declared in the domain specification

### 2. Moment DSL

The Moment DSL is a business-readable language that describes user journeys as chronological, branching narratives referencing the event manifest by name. The DSL is the "narrative" — it describes what happens when, while the manifest provides what each thing is.

Authoring: Sift fully generates moment DSL files from event chain analysis of the manifest. The architect reviews and approves. The generation process:

- Sift identifies entry points (user actions that initiate event chains)

- For each entry point, Sift traces the event chain through the manifest following producedBy and consumers relationships

- At each branchConditions node, Sift forks the narrative into when blocks

- terminal nodes end a path

- The generated DSL is presented to the architect for review in the Refinement context

Grammar:

```
moment "<n>"

lane <id> "<label>" [<classification>]
branch-lane <id> "<label>" [<classification>]

moment "<narrative description>"
  <lane>: <manifest-entry-name>
  <lane>: <manifest-entry-name> (<multiplicity>)
    "<optional inline description>"
    crosses-to <lane> via <relationship>
    triggered-by <manifest-entry-name>
    returns-to "<moment-name>"
    triggers <manifest-entry-name>

moment "<narrative description>" [branch]
  <lane>: <manifest-entry-name>

  when <condition>
    <lane>: <manifest-entry-name>

  when <condition> [<branch-lane>]
    <branch-lane>: <manifest-entry-name>
    <branch-lane>: <manifest-entry-name> [terminal]
```

Grammar rules:

| Construct                               | Purpose                          | Example                                                |
| --------------------------------------- | -------------------------------- | ------------------------------------------------------ |
| lane \<id> "\<label>" [\<class>]        | Declare a context swim lane      | lane ingestion "Ingestion" [Supporting]                |
| branch-lane \<id> "\<label>" [\<class>] | Declare a toggleable branch lane | branch-lane parseFail "Parse Failure" [Terminal]       |
| moment "\<text>"                        | Declare a moment in time (frame) | moment "Architect uploads PRD"                         |
| moment "\<text>" [branch]               | Declare a branching moment       | moment "Parsing outcome" [branch]                      |
| moment "\<text>" [branch, \<lane>]      | Branch moment scoped to a lane   | moment "Coaching output" [branch, coaching]            |
| \<lane>: \<n>                           | Place a manifest entry in a lane | ingestion: RegisterInputSource                         |
| \<lane>: \<n> (×N)                      | Multiplicity marker              | ingestion: ConceptStatementExtracted (×N)              |
| \<lane>: \<n> [optional]                | Optional occurrence              | ingestion: ConceptStatementDuplicate [optional]        |
| \<lane>: \<n> [terminal]                | Terminal state                   | parseFail: InputProcessingStalled [terminal]           |
| \<lane>: saga \<state>                  | Saga state transition            | ingestion: saga Extracting                             |
| "\<text>" (indented)                    | Inline description               | "Pipeline halted. NormalizationCompleted NOT emitted." |
| crosses-to \<lane> via \<rel>           | Cross-context connection         | crosses-to interpretation via Partnership              |
| triggered-by \<n>                       | Declares upstream trigger        | triggered-by NormalizationCompleted                    |
| returns-to "\<moment>"                  | Cycle-back to a prior moment     | returns-to "Input source registered"                   |
| triggers \<n>                           | Declares downstream activation   | triggers InputProcessingSaga                           |
| when \<condition>                       | Branch condition block           | when success                                           |
| when \<condition> [\<lane>]             | Branch into a specific lane      | when failure [parseFail]                               |

Name resolution: Every name in the DSL (e.g., RegisterInputSource, NormalizationCompleted, InputProcessingSaga) is resolved against the manifest by matching ManifestEntry.name. The generator joins the DSL's narrative structure with the manifest's metadata to produce the visualization data model. Ambiguous names (same name in multiple contexts) are resolved by the lane in which they appear.

### 3. Visualization Pipeline

The generator consumes the parsed DSL and resolved manifest references to produce a MomentData intermediate representation. Two renderers consume this IR:

Timeline View (NDD-style): Horizontal swim lane visualization with frames as moments in time. Context lanes are always visible. Branch lanes toggle on/off. Nodes placed in lane cells per frame. SVG connection lines render cross-boundary event flow, branch paths, and cycle-back references. Click-to-expand detail panels show full manifest metadata. This view is optimized for visual thinkers and cross-boundary flow comprehension.

Sequence View: Vertical phased card list with expandable detail panels. Nodes rendered as interactive cards grouped by phase. Filter by node type and bounded context. Expand/collapse all. ADR tags, aggregate ownership, and payload details inline. This view is optimized for readers and sequential comprehension.

Both views render from the same MomentData IR — no divergence risk.

MomentData IR Schema:

```
type MomentData = {
  name: string;
  lanes: LaneDef[];
  branchLanes: LaneDef[];
  frames: FrameDef[];
  connections: ConnectionDef[];
};

type LaneDef = {
  id: string;
  label: string;
  classification: string;
  color: string;
  group: "context" | string;  // branch lane group ID
};

type FrameDef = {
  id: string;
  moment: string;
  isBranch: boolean;
  nodes: NodeDef[];
};

type NodeDef = {
  id: string;
  lane: string;
  manifestRef: string;  // Resolved ManifestEntry.id
  label: string;
  type: string;         // From ManifestEntry.kind
  detail: string;       // From ManifestEntry.description
  adrs: string[];       // From ManifestEntry.adrs
  aggregate?: string;
  optional?: boolean;
  terminal?: boolean;
  multiplicity?: string;
  path?: string;        // Branch path association
};

type ConnectionDef = {
  from: string;      // NodeDef.id
  to: string;        // NodeDef.id
  label?: string;
  style: "happy" | "cross" | "branch" | "return";
  crossBoundary?: boolean;
  relationship?: string;
};
```

### 4. Seam Consumption Contract

The Moment DSL serves a dual purpose for Seam: documentation and behavioral verification.

Documentation: Seam's developer reads the moment DSL to understand the expected event chain behavior of the domain model they are synchronizing. The manifest provides the complete payload and type information for each event.

BDD Assertion Generation: The generator derives BDD assertion contracts from the DSL for Seam's test harness. The derivation is governed by a complete construct-to-BDD mapping that covers every DSL keyword, every manifest entry kind, and every context relationship type. Key design decisions:

- Context-centric test organization (ducks pattern): Generated test suites are organized by bounded context, not by test category. Each context folder contains its own schemas, behavioral assertions, and contractual obligations — mirroring the domain model structure. Moment files are cross-cutting orchestrators that import and sequence assertions from context modules.

- Relationship-dispatched contracts: The crosses-to keyword generates contract assertions whose structure is determined by the relationship type (via Partnership, via Customer-Supplier, via Conformist, via Published Language). Partnership generates bidirectional obligations in both context folders. Customer-Supplier generates unidirectional supplier obligations. Conformist generates schema conformance only. Published Language generates schema validation with consumer compatibility checks.

- Causal nesting: Relational keywords (crosses-to, triggered-by, triggers, returns-to) produce causally nested assertions — a crossing assertion is nested inside its prerequisite emission assertion, not flattened into independent test blocks.

- 17 validation rules: The generator enforces grammar correctness (name resolution, branch exhaustiveness, modifier compatibility) before producing any BDD output.

The complete BDD Derivation Manifest — including the full construct-to-assertion mapping, manifest entry kind dispatch table, relationship type contract structures, composition rules, and validation rules — is specified in the child page: Moment [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md): BDD Derivation Manifest.

Seam does not need to understand the visualization rendering — it consumes the DSL as a behavioral specification and the manifest as a type registry.

## Consequences

What becomes easier:

- Building block completeness is machine-verifiable — the manifest validator catches orphaned events, missing consumers, and stale ADR references

- User journeys are formally specified rather than implicitly understood — reducing alignment risk between architect, product, and engineering

- Visualization is generated, not hand-crafted — no divergence between the narrative and the system's actual structure

- Two complementary views serve different cognitive styles without maintaining separate artifacts

- Seam gains a formal behavioral verification layer against the domain specification — the gap between "what was specified" and "what was implemented" becomes testable

- Moment coverage analysis becomes possible — identifying events that appear in no moment (potential dead code) or moments that miss branch paths (incomplete specification)

- BDD test organization mirrors domain model structure — each bounded context's test folder is self-contained and independently navigable

What becomes harder:

- The manifest must be maintained alongside the domain specification — for internal models this is a manual authoring burden until Sift can dogfood its own pipeline

- The DSL grammar is a new artifact to version and evolve — grammar changes require updating the generator, both renderers, and the Seam assertion generator

- The generator must handle the full complexity of event chain analysis including cycles (coaching → new saga → normalization → coaching again), parallel paths, and optional occurrences

- The BDD derivation manifest ([ADR-001-A](ADR-001-A-bdd-derivation-manifest.md)) must be maintained alongside the DSL grammar — new DSL constructs require corresponding derivation rules

## Compliance Impact

- SOC 2 CC8.1: The moment DSL and manifest provide machine-readable specification artifacts that complement the ADR version message audit trail. Moment changes are versioned alongside the domain specification.

- SOC 2 CC7.2: Seam's BDD assertion contracts generated from the moment DSL provide continuous behavioral verification of the specification implementation.

## Alternatives Considered

1. Mermaid-only diagrams (rejected): Mermaid sequence and flowchart diagrams were considered for moment visualization. Rejected because: Mermaid cannot represent toggleable branch paths, interactive detail panels, or multiple cognitive styles from a single source. Mermaid is retained for the static architecture diagrams ([ADR-024](ADR-024-git-artifact-retrieval-trees-api-semantic-index.md)) but is insufficient for moment-level event chain visualization.

2. Miro/Figma canvas tools (rejected): Collaborative canvas tools provide excellent spatial layout but are not version-controlled, not generatable from source, and not embeddable in the documentation pipeline. They would create a divergence risk between the visual and the specification.

3. DSL as self-contained specification (rejected): An alternative DSL design included all metadata inline (payloads, ADR tags, aggregate ownership). Rejected because this duplicates the manifest and creates a maintenance burden. The principle "DSL is narrative, manifest is detail, generator joins them" keeps each artifact focused on its purpose.

4. Manual moment authoring only (rejected): Requiring architects to hand-author moment DSL files would bottleneck specification throughput. Sift's AI-powered event chain analysis can derive moments from the manifest structure, with the architect providing approval rather than authorship. This aligns with Sift's core thesis that AI compresses architect work.

5. Single visualization format (rejected): Only producing the NDD-style timeline view would exclude users who prefer sequential reading. Only producing the sequence card view would miss the cross-boundary flow comprehension that the timeline provides. Both formats are generated from the same IR, so the cost of supporting two renderers is low relative to the coverage gain.

6. Flat BDD test organization by category (rejected): Organizing generated tests by category (moments/, contracts/, schemas/ at top level) was considered. Rejected because it mirrors framework structure rather than domain structure. The ducks pattern — organizing by bounded context with each context owning its schemas, contracts, and behaviors — keeps domain cohesion in the test suite and mirrors how the production code is organized. Moment orchestrators remain at the top level as cross-cutting choreography.

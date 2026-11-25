# ADR-023: Simulation Output Contracts — Topology Emission and Trace Format

Migrated from Confluence page 41877521 (version 1, last updated 2026-03-28), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/41877521. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Date:** 2026-03-27
- **Author:** Michael Dyer
- **Scope:** @mmmnt/core, @mmmnt/derive, @mmmnt/harness, @mmmnt/cli, @complai/projection
- **Supersedes:** None
- **Relates to:** [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md) (Event Manifest & MomentData IR), [ADR-001-A](ADR-001-A-bdd-derivation-manifest.md) (BDD Derivation Manifest), [ADR-005](ADR-005-gherkin-generation-layer-feature-file-generation-from-moment.md) (Gherkin Generation), [ADR-021](ADR-021-event-payload-contract.md) (Event Payload Contract), PADR-004 (Event Envelope Contract), PADR-006 (Moment/Seam Unification), GAP-FACET-016 (Simulation Event Contract)

## Context

Moment's derivation pipeline produces four output formats from the .moment specification: TypeScript types and aggregates (TypeScriptEmitter), TypeScript test scaffolds (MomentTestEmitter), Gherkin features and step definitions (GherkinEmitter), and architecture palette diagrams (MermaidEmitter). All four consume the Intermediate Representation (IR) produced by MomentParser (Langium). The first three additionally consume the TestSuiteTopology produced by the DerivationEngine.

The pipeline has no output format for visualization consumers. Complai Facet — the visual expression layer — needs two artifacts from Moment:

- Domain model topology: The structural graph of bounded contexts, aggregates, events, commands, crossing declarations, event routing, and branch predicates. This is the "what to draw" contract — the spatial structure that Facet renders on the canvas before any simulation runs.

- Simulation trace: The step-by-step execution record produced when moment simulate walks a topology with a scenario seed. This is the "what happened" contract — the temporal sequence that Facet projects onto the canvas for playback, temporal scrubbing, and failure diagnostic overlays.

Facet's working prototype (facet-client) has already implemented and validated both contracts against a veterinary clinic domain with 115 passing assertions across 5 scenarios. The topology schema is defined as SimulationTopology in Facet's type system. The trace event payloads are defined as five typed interfaces in simulation-results.ts. GAP-FACET-016 identified the simulation event contract as hypothetical and contract-dependent — this ADR resolves that gap by establishing the contract on the Moment side.

Additionally, the ecosystem requires a platform-level strategy for format negotiation at the event consumption edge. AI consumers (InterpretationEngines across all Complai products) benefit from TOON (Token-Oriented Object Notation) — a compact, schema-aware serialization format that achieves ~40% token reduction and improved LLM comprehension accuracy over JSON for uniform arrays. This ADR establishes JSON as Moment's canonical output format and defers TOON projection to a shared platform package consumed at the edge.

## Decision

### 1. TopologyEmitter — Fifth Emitter in the Derivation Pipeline

The derivation pipeline gains a fifth emitter, TopologyEmitter, that produces a structured JSON representation of the domain model topology from the IR and TestSuiteTopology.

Emitter registry (updated from [ADR-005](ADR-005-gherkin-generation-layer-feature-file-generation-from-moment.md) §6):

| Order | Emitter           | Output                                   | Depends On                                  |
| ----- | ----------------- | ---------------------------------------- | ------------------------------------------- |
| 1     | TypeScriptEmitter | .types.ts, .aggregate.ts, .spec.ts, etc. | Modeling events, SpecDefined                |
| 2     | MomentTestEmitter | .moment.spec.ts                          | MomentSpecDefined, TypeScriptEmitter output |
| 3     | GherkinEmitter    | .feature, .steps.ts                      | MomentSpecDefined, TypeScriptEmitter output |
| 4     | MermaidEmitter    | Architecture palette diagrams            | Modeling events                             |
| 5     | TopologyEmitter   | topology.json, seeds/\*.seed.json        | IR, TestSuiteTopology                       |

TopologyEmitter is terminal — no downstream emitter depends on its output. It reads from the IR (for lanes, frames, connections, contextMap) and the TestSuiteTopology (for eventRouting, branchPredicates), and writes data artifacts to the .moment/ output directory.

Naming rationale: The emitter is named TopologyEmitter, not FacetLayoutEmitter. Moment does not know Facet exists (Design Principle #15). It emits a general-purpose domain model topology that any visualization consumer can use. Facet is the first consumer; it is not the only possible consumer.

### 2. Topology Output Schema

TopologyEmitter produces a SimulationTopology-compatible JSON document. The schema extends MomentData IR ([ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md)) with routing and branching metadata derived from the specification:

```
interface SimulationTopology {
  // MomentData core (ADR-001)
  name?: string;
  version?: number;
  lanes: LaneDef[];
  frames: FrameDef[];
  connections: ConnectionDef[];

  // Derived from TestSuiteTopology
  eventRouting: Record<string, string[]>;
  branchPredicates: Record<string, BranchPredicate>;

  // Derived from crossing declarations + lane contextIds
  contextMap?: ContextMap;

  // ADR cross-references
  adrLinks?: Record<string, string>;
}
```

Excluded from Moment's output: nodeTypeStyles and connectionStyles. These are visual presentation concerns owned by Facet. Moment emits structure; Facet applies style. If nodeTypeStyles or connectionStyles are present in a topology file consumed by Facet, they are Facet-authored, not Moment-authored.

Supporting types:

```
interface LaneDef {
  id: string;
  label: string;
  classification: string;
  color: string;
  group: "context" | string;
  contextId?: string;
}

interface NodeDef {
  id: string;
  lane: string;
  manifestRef?: string;
  label: string;
  type: string;          // NodeKind — data-driven, not fixed enum
  detail: string;
  adrs: string[];
  aggregate?: string;
  optional?: boolean;
  terminal?: boolean;
  multiplicity?: string;
  path?: string;
  eventTypes?: string[];
}

interface FrameDef {
  id: string;
  moment: string;
  isBranch: boolean;
  nodes: NodeDef[];
}

interface ConnectionDef {
  from: string;
  to: string;
  label?: string;
  style: string;          // ConnectionStyle — data-driven, not fixed enum
  crossBoundary?: boolean;
  relationship?: string;
  schemaContract?: SchemaContractRef;
}

interface BranchPredicate {
  field: string;
  defaultRoute: string;
  routes: Record<string, string>;
}

interface ContextMap {
  contexts: BoundedContext[];
  relationships: ContextRelationship[];
}

interface BoundedContext {
  contextId: string;
  name: string;
  classification: "core" | "supporting" | "generic" | "external";
  laneId: string;
  aggregates: string[];
  color: string;
}

interface ContextRelationship {
  sourceContextId: string;
  targetContextId: string;
  relationshipType: "partnership" | "customer-supplier" | "conformist"
    | "anticorruption-layer" | "open-host-service"
    | "published-language" | "separate-ways";
  contractIds: string[];
}

interface SchemaContractRef {
  contractId: string;
  requiredFields: string[];
  fieldTypes?: Record<string, string>;
}
```

### 3. Seed and Trace Separation

Simulation input (seed) and simulation output (trace) are distinct artifacts with separate schemas.

Seed — simulation input:

```
interface SimulationSeed {
  scenarioId: string;
  scenarioLabel: string;
  description: string;
  given?: string;
  when?: string;
  then?: string;
  expectedPath: string[];
  activeBranches: string[];
  initialConditions?: Record<string, unknown>;
}
```

The seed defines what to simulate — scenario metadata, GWT behavioral assertions, expected node path, active branch selections, and any initial aggregate state. It does not contain events. Events are the output of simulation, not the input.

Seeds are derived from .moment specifications by the TopologyEmitter. Each moment specification with a complete flow path produces a seed file. Seeds can also be hand-authored for custom simulation scenarios.

Trace — simulation output:

```
interface SimulationTrace {
  started: SimulationStartedPayload;
  steps: SimulationStepCompletedPayload[];
  assertions: (SimulationAssertionPassedPayload | SimulationAssertionFailedPayload)[];
  completed: SimulationCompletedPayload;
}
```

The trace is the structured record produced by the simulation harness. It is a clean data structure — no transport concerns, no envelope wrapping. Callers (CLI or subgraph resolver) decide delivery.

### 4. Simulation Event Payloads

Five event types, conforming to the shapes validated in Facet's prototype with three modifications for provenance and cross-boundary visibility:

SimulationStartedPayload:

```
interface SimulationStartedPayload {
  simulationId: string;
  specificationId: string;
  scenarioId: string;
  flowId: string;
  totalEvents: number;
  expectedPath: string[];
  startedAt: string;
  topologyVersion: number;     // NEW: version of topology used for this simulation
}
```

SimulationStepCompletedPayload:

```
interface SimulationStepCompletedPayload {
  simulationId: string;
  stepIndex: number;
  frameId: string;
  nodeId: string;
  laneId: string;
  eventType: string;
  eventId: string;
  timestamp: string;
  branchActivated?: string;
  sourceContextId: string;      // NEW: originating bounded context
  targetContextId?: string;     // NEW: target context (present on cross-boundary steps only)
}
```

SimulationAssertionPassedPayload:

```
interface SimulationAssertionPassedPayload {
  simulationId: string;
  assertionId: string;
  assertionType: AssertionType;
  stepIndex: number;
  nodeId: string;
  detail: string;
  assertionSource: string;     // NEW: reference to .moment spec location
}
```

SimulationAssertionFailedPayload:

```
interface SimulationAssertionFailedPayload {
  simulationId: string;
  assertionId: string;
  assertionType: AssertionType;
  stepIndex: number;
  nodeId: string;
  expected: string;
  actual: string;
  diagnostic: string;
  assertionSource: string;     // NEW: reference to .moment spec location
}
```

SimulationCompletedPayload:

```
interface SimulationCompletedPayload {
  simulationId: string;
  totalSteps: number;
  totalAssertions: number;
  passCount: number;
  failCount: number;
  duration: number;
  actualPath: string[];
  expectedPath: string[];
  pathMatch: boolean;
  completionReason: string;
  traceSummary: string;
}
```

AssertionType (unchanged from Facet prototype):

```
type AssertionType =
  | "path"
  | "boundary_crossing"
  | "schema_contract"
  | "branch_evaluation"
  | "terminal_state";
```

### 5. Simulation Execution Ownership — @mmmnt/harness

The simulation engine lives in @mmmnt/harness. The harness package already owns test execution infrastructure and contract assertions. Simulation is behavioral verification — the harness running a scenario seed against a topology and producing a trace.

The harness exposes:

```
function simulate(
  topology: SimulationTopology,
  seed: SimulationSeed,
): SimulationTrace;
```

Pure function. Takes topology and seed, returns trace. No transport awareness, no Kafka, no file I/O. The caller decides delivery.

CLI caller (moment simulate):

```
moment simulate --scenario happy-path
  → stdout: human-readable pass/fail summary (default)

moment simulate --scenario happy-path --output json
  → stdout: SimulationTrace as JSON

moment simulate --scenario happy-path --output json --out-file trace.json
  → file: trace.json written to disk
```

No --output toon flag. Moment emits JSON only. TOON is a consumption-edge concern (§7).

Cloud caller (Moment subgraph resolver):

The subgraph resolver invokes the harness, receives the SimulationTrace, wraps each constituent event in a PADR-004 ComplaiEventEnvelope with productSource: "moment:simulation", and publishes to Kafka. The resolver is the integration layer — the harness never imports Kafka clients, never knows about PADR-004 envelopes, never touches the network.

### 6. Output File Structure

moment generate output (TopologyEmitter):

```
.moment/
├── topology.json
└── seeds/
    ├── first-time-document-ingestion.seed.json
    ├── refinement-session.seed.json
    └── ...
```

The .moment/ directory lives at project root, parallel to .domain/ (used by @mmmnt/sync for JSONL persistence). Topology and seeds are data artifacts consumed by external tools — they are not source code and do not belong in src/.

The TopologyEmitter generates one topology.json and one .seed.json per derivable scenario. Seeds are regenerated on every moment generate invocation. The topology file carries a version field incremented on each generation.

moment simulate output:

Traces are runtime output, not generated artifacts. They are written to stdout or a specified file path via CLI flags. They are not persisted in .moment/ — they are ephemeral execution results.

### 7. @complai/projection — Platform Format Negotiation

A new platform-level package that handles format negotiation at the event consumption edge.

Package:

| Field      | Value                      |
| ---------- | -------------------------- |
| Name       | @complai/projection        |
| Registry   | npm (private, scoped)      |
| License    | Proprietary                |
| Dependency | @toon-format/toon          |
| Consumers  | Product subgraph resolvers |

Exports:

```
enum OutputFormat {
  JSON = "json",
  TOON = "toon",
}

function projectTrace(trace: SimulationTrace, format: OutputFormat): string;
function projectTopology(topology: SimulationTopology, format: OutputFormat): string;
```

Architectural position: TOON never enters Moment's output pipeline. Moment emits JSON. When a GraphQL query specifies format: TOON, the subgraph resolver passes the JSON data through @complai/projection before returning it. The package wraps @toon-format/toon (MIT license, v1.3.3, TypeScript SDK) and provides typed projection helpers.

JSON passthrough: When format: JSON, the projection functions serialize without transformation. @complai/projection owns the OutputFormat enum and the projection pattern — it is not TOON-specific.

Why TOON at the edge: Every Complai product has an InterpretationEngine — an AI layer that consumes structured data for reasoning. Simulation traces are uniform arrays of step events, which is TOON's optimal shape (~40% token reduction, improved LLM comprehension accuracy). But TOON is a read-side concern. The event store (Kurrent Cloud) is JSON. The wire format (Kafka, PADR-004) is JSON. Every product emits JSON. TOON projection happens when a consumer requests events — single or replayed batch — and declares the format it wants. This is content negotiation at the consumption edge, not a transport or persistence concern.

Kafka replay integration: Kurrent Cloud supports full event replay. When a consumer requests a complete simulation trace via GraphQL with format: TOON, the subgraph resolver replays events from the event store, assembles the SimulationTrace, and projects it through @complai/projection. The entire trace — 50–200 uniform step events — becomes one compact TOON tabular document. This is where token savings and accuracy improvements compound: not at individual event granularity, but at the projected aggregate level.

Subgraph schema extension:

```
enum OutputFormat {
  JSON
  TOON
}

type SimulationTraceResult {
  data: String!
  format: OutputFormat!
  eventCount: Int!
  traceId: ID!
}

type Query {
  simulationTrace(traceId: ID!, format: OutputFormat! = JSON): SimulationTraceResult!
}
```

The GraphQL response envelope is always JSON (GraphQL spec). The data field within the response carries the negotiated format — either JSON or TOON serialized as a string.

Extraction trigger: @complai/projection is the platform-level package from day one. It does not start in the Moment monorepo. When additional products need format-specific projection helpers (e.g., Sift specification events, Glean learning batches), the package gains product-specific projection functions without requiring extraction or migration.

## Consequences

### What becomes easier

- Facet can consume Moment's simulation output through a defined, versioned contract rather than hypothetical event types

- moment simulate --output json gives developers structured traces for CI integration, debugging, and AI agent consumption

- The TopologyEmitter produces the canvas layout data Facet needs without Facet re-deriving routing and branching from raw IR

- @complai/projection provides a single integration point for TOON across all products — no per-product TOON implementation

- Seed/trace separation enables Moment to own simulation execution while Facet owns visualization — clean boundary

- The topologyVersion field on SimulationStartedPayload prevents trace/topology version mismatch at render time

- sourceContextId and targetContextId on step events give Facet cross-boundary flow visualization without lane-to-context lookups

- assertionSource links assertion results back to .moment specification lines for diagnostic traceability

### What becomes harder

- Five emitters increase moment generate execution time (mitigated by TopologyEmitter's terminal position — it can be parallelized with MermaidEmitter since neither has downstream dependencies)

- Facet's current data model requires modification — SimulationSeed.events is removed, SimulationTrace replaces it as the playback input, walkerSaga consumes trace events instead of seed events

- @complai/projection introduces a platform-level dependency — all product subgraphs that want TOON support must import a proprietary shared package

- TOON format maturity risk — spec is v1.3.3, approximately six months old. Mitigated by JSON-first architecture: TOON is lossless with JSON, so the round-trip is guaranteed. If TOON evolves or is abandoned, JSON remains the source of truth and TOON projection can be removed without data loss.

### What this enables

- Facet V1 development can proceed — GAP-FACET-016 is resolved

- Moment → Sift feedback loop — simulation traces can flow back to Sift for specification refinement (future PADR candidate for bidirectional event contracts)

- AI agent integration — MCP tools can return simulation traces in TOON for optimal LLM reasoning

- Cross-product simulation analysis — Glean can consume TOON-projected simulation traces for learning pattern detection

- Future output formats follow the same edge-projection pattern — no Moment pipeline changes required

## Alternatives Considered

### 1. Moment emits MomentData only; Facet derives routing and branching (rejected)

Facet would re-derive eventRouting and branchPredicates from raw IR — information Moment's derivation engine already computed. Redundant work with consistency risk. The derivation engine is the authoritative source for these derivations.

### 2. Moment emits full SimulationTopology including styles (rejected)

nodeTypeStyles and connectionStyles are visual presentation concerns. Moment has no business deciding colors, dash patterns, or icons. Style is Facet's domain. Moment emits structure; Facet applies style.

### 3. FacetLayoutEmitter naming (rejected)

Implies Facet awareness, violating Design Principle #15. TopologyEmitter is product-agnostic — it emits a domain model topology, not a Facet layout.

### 4. Simulation engine in a new @mmmnt/simulate package (rejected)

Simulation is behavioral verification. @mmmnt/harness already owns test execution and contract assertions. Splitting simulation into a separate package fragments the verification surface without architectural justification.

### 5. Seed contains pre-authored events (rejected — current Facet approach)

Conflates input and output. Seeds with events are playback scripts, not simulation inputs. True simulation requires an engine that walks the topology, evaluates routing and branching, and produces events as output. Pre-authored events bypass the engine entirely.

### 6. @mmmnt/toon in the Moment monorepo, extracted later (rejected)

TOON projection benefits every product's InterpretationEngine, not just Moment's. Building it in the Moment monorepo creates the wrong dependency direction — either other products import a Moment package (violating independence), or the extraction becomes migration debt. @complai/projection is the platform package from day one.

### 7. TOON as a Moment output format (--output toon) (rejected)

Moment emits JSON. TOON is a consumption-edge concern. The event store is JSON. The wire format is JSON. Kafka messages are JSON in PADR-004 envelopes. Introducing TOON into Moment's output pipeline conflates production format with consumption format. Content negotiation belongs at the edge — when a consumer requests data, it declares the format it wants, and the platform translates.

### 8. Dedicated replay subgraph for format negotiation (rejected)

A shared "Event Replay" subgraph would need to understand every product's event schemas. At alpha, this is premature abstraction. Each product's subgraph has domain context for its own events. The shared library (@complai/projection) standardizes the projection pattern while keeping event ownership with the product that emitted them.

## Cascade Impact

### Facet

- SimulationSeed type: remove events field, add initialConditions field

- SimulationTrace type: new type matching this ADR's definition

- walkerSaga.ts: consume SimulationTrace steps instead of SimulationSeed.events

- simulation-results.ts: add topologyVersion to SimulationStartedPayload, add sourceContextId/targetContextId to SimulationStepCompletedPayload, add assertionSource to both assertion payloads

- public/simulations/: split scenario JSON files into separate seed and trace files

- moment-ir-validation.ts: type assertion remains valid — SimulationTopology still extends MomentData

### Moment Domain Specification

- Specification Parsing context: SimulationStarted and SimulationCompleted event descriptions updated with new fields

- Derivation context: SimulationAssertionPassed and SimulationAssertionFailed event descriptions updated with assertionSource

- Generation context: TopologyEmitter added as 5th emitter

- Test Execution context (@mmmnt/harness): simulate() function added

### Moment Execution Plan Manifest

- New epic: TopologyEmitter implementation

- New epic: Simulation engine in @mmmnt/harness

- New stories under existing CLI epic: moment simulate --output json flag

### Platform

- PADR candidate: @complai/projection and platform content negotiation strategy

- PADR candidate: Moment → Sift bidirectional event feedback loop

### ADR Index

- ADR-023 added to registry

- Execution Governance table: new row for simulation output contracts

- Cascade Dependencies table: ADR-023 cascades to [ADR-021](ADR-021-event-payload-contract.md) (new simulation event types follow ComplaiEventEnvelope), [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md) (TopologyEmitter extends MomentData IR output)

## Compliance Impact

SOC 2 CC8.1: TopologyEmitter output carries version field for change tracking. Simulation traces carry simulationId and topologyVersion for provenance. assertionSource on assertion payloads links results to specification source.

SOC 2 CC7.2: Simulation traces are structured, deterministic records of behavioral verification. Same topology + same seed always produces the same trace. The harness applies the same derivation manifest validation rules ([ADR-001-A](ADR-001-A-bdd-derivation-manifest.md)) as all other emitters.

# ADR-006: Manifest Authoring Strategy

Migrated from Confluence page 12124162 (version 1, last updated 2026-03-09), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/12124162. The Confluence space is private; this file is now the record.

- **Status:** Accepted
- **Date:** March 9, 2026
- **Deciders:** listenrightmeow, Claude (DDD Coaching Project)
- **Tags:** @mmmnt/core, manifest, adoption
- **Gap Report Ref:** SG-03, DG-03 (Pass 1)

## Context

Before a domain architect can write their first .moment file, they need an Event Manifest — the structured registry of every building block in their domain specification (events, commands, policies, sagas, projections, aggregates, with their metadata: owning context, ADR references, consumers, payload schemas, branch conditions).

For Complai Sift users, the manifest is a runtime projection from SpecificationRoot's event stream — it materializes automatically as spec events arrive. No manual authoring required.

For open-source users (@mmmnt packages without Sift), the manifest must be authored by hand. This is the primary adoption friction point. The PRD's Success Metric requires a domain architect to go from install to executable test scaffolds in under 30 minutes for a 3-context domain with 2-3 moment specs. The manifest authoring experience directly determines whether that target is achievable.

Three strategies were evaluated for V1:

- Hand-authored YAML: Architect writes a .manifest.yaml file conforming to the ManifestEntry schema defined in [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md). A moment init CLI command scaffolds a skeleton manifest from interactive prompts.

- Manifest-from-types generator: Scan TypeScript event type definitions and infer manifest entries from naming conventions and JSDoc annotations. Requires defining and documenting annotation conventions.

- ContextMapper (CML) import: Parse ContextMapper .cml files and extract building blocks into a manifest. Bridges existing DDD toolchain users already working with CML-based structural models.

## Decision

### V1: Hand-authored YAML with moment init scaffolding

The V1 manifest authoring path is hand-authored YAML. The ManifestEntry schema ([ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md)) maps directly to YAML without translation. A .manifest.yaml file is human-readable, diffable, and version-controllable.

File format: .manifest.yaml at the project root (or path specified by CLI flag). Schema follows the ManifestEntry type from [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md):

```
# .manifest.yaml
version: "1.0"
contexts:
  - name: ingestion
    classification: Supporting
    aggregates:
      - name: InputSource
        entries:
          - name: RegisterInputSource
            kind: command
            description: "Register a new input source for processing"
            producedBy: "architect-action"
            payload:
              sourceType: "document | prompt | conversational"
              content: "string"
          - name: InputSourceRegistered
            kind: event
            description: "Input source accepted into the pipeline"
            consumers:
              - context: ingestion
                component: InputProcessingSaga
                relationship: internal
            payload:
              sourceId: "string (ULID)"
              sourceType: "document | prompt | conversational"
              fingerprint: "string (SHA-256)"
```

moment init scaffolding: The CLI command moment init generates a skeleton .manifest.yaml via interactive prompts:

- How many bounded contexts? Name them.

- For each context: classification (Core/Supporting/Generic), aggregate names.

- For each aggregate: seed with common DDD building block stubs (one command, one event per aggregate).

The architect fills in descriptions, payloads, consumers, and ADR references. The manifest validation engine (ValidateManifest in the Specification context) catches missing entries, orphaned references, and incomplete branch conditions — providing a tight feedback loop during authoring.

### Post-V1: Manifest-from-types generator (V1.1)

A moment manifest-from-types command will scan TypeScript event type definitions and infer manifest entries. This requires:

- Naming conventions (e.g., types ending in Command, Event, Policy map to corresponding kinds)

- JSDoc annotations for metadata the type system cannot express (owning context, ADR references, consumer relationships)

- A merge strategy for combining inferred entries with hand-authored overrides

This path significantly reduces authoring friction for TypeScript teams but requires convention design and documentation.

### Post-V1: ContextMapper (CML) import (V2+)

A moment import-cml command will parse .cml files and extract bounded contexts, aggregates, entities, events, and context relationships into a manifest. CML is the most established structural DDD DSL (Xtext/Langium-based), and teams using ContextMapper for spatial modeling would gain seamless integration with Moment for temporal modeling.

This path has the highest implementation effort (CML parser integration) but serves the community if CML adoption is significant. The decision to invest depends on community demand signal post-V1 launch.

## Consequences

What becomes easier:

- V1 onboarding requires no tooling beyond a text editor and the moment CLI — YAML is universally known

- moment init scaffolding compresses the "blank page" problem into fill-in-the-blanks

- Manifest validation catches errors early, before the architect writes any .moment files

- The YAML format is stable and can serve as the target for future automated generators (from-types, CML import)

What becomes harder:

- Manual manifest maintenance for large domains — a 50-aggregate domain produces a large YAML file. The from-types generator (V1.1) is the mitigation path.

- The manifest must stay synchronized with the domain specification — stale manifests produce stale test scaffolds. Manifest validation mitigates but doesn't eliminate this.

- No IDE assistance for manifest authoring in V1 — the Langium LSP covers .moment files but not .manifest.yaml. A JSON Schema for the YAML format would enable basic validation in editors.

What to watch:

- Community signal on CML usage — if significant adoption exists among early users, prioritize import-cml over other V2 features

- Whether the 30-minute onboarding target is achievable with YAML + moment init — measure during alpha and adjust if needed

## Alternatives Considered

1. JSON instead of YAML (rejected): JSON is more verbose and less readable for deeply nested structures like manifest entries. YAML's anchors and references also allow DRY patterns for repeated payload shapes. JSON remains supported as a format (YAML is a superset), but YAML is the documented and scaffolded default.

2. TypeScript as manifest format (rejected): Using a TypeScript file (manifest.ts) that exports typed manifest entries was considered. Advantages: type-checking, IDE support, composability. Rejected because it couples the manifest to TypeScript — the DSL and manifest should be language-agnostic artifacts that a Go or Rust team could use. YAML preserves language independence.

3. Manifest-from-types as V1 (rejected): Starting with the automated generator was considered to minimize adoption friction. Rejected because the convention design (annotation format, naming rules, merge strategy) is a separate design surface that would delay V1. YAML is a known quantity. The from-types generator benefits from observing how architects actually structure manifests in V1 before encoding conventions.

4. No manifest — DSL-only with inline metadata (rejected): Embedding all metadata directly in .moment files was considered. Rejected per [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md)'s principle: "DSL is narrative, manifest is detail, generator joins them." Inline metadata would bloat the DSL and duplicate information across moment specs that reference the same building blocks.

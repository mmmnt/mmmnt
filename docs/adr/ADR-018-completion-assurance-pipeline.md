# ADR-018: Completion Assurance Pipeline — Moment

Migrated from Confluence page 21823597 (version 1, last updated 2026-03-16), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/21823597. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.0
- **Date:** 2026-03-15
- **Parent ADR:** PADR-001: Completion Assurance Pipeline
- **Parent Version:** 1.3

## Context

Moment is the unified Domain Specification Language and Implementation Toolchain. It operates in two deployment contexts: Moment CLI (@mmmnt/cli — local developer tool operating on .moment/ files in a git repository) and Moment Cloud (cloud subgraph accepting Moment DSL operations via GraphQL mutations, event-sourced in Kurrent Cloud, emitting to Kafka).

Moment's completion assurance concerns are distinct from other products because of the dual deployment model. The CLI writes to local JSONL event files and generated TypeScript artifacts on the filesystem. Moment Cloud writes to Kurrent Cloud event streams and DynamoDB projection tables. Both paths produce structured artifacts that require integrity verification, but the write surfaces and failure modes differ significantly.

Moment's primary generated artifacts requiring completion assurance:

- Moment DSL parse results (CLI + Cloud) — structured AST output from parsing .moment files. Parse failures can be silent — a partially parsed file produces a valid but incomplete AST that downstream packages (@mmmnt/derive, @mmmnt/generate) consume without awareness of the gap.

- TypeScript projections (@mmmnt/emit-ts) — generated TypeScript types, interfaces, aggregate stubs, value object implementations, and test scaffolds. A truncated projection produces compilable but incomplete TypeScript that silently omits domain concepts. This is the highest-stakes Moment write surface: developers consume these artifacts as implementation foundations.

- Derivation results (@mmmnt/derive) — behavioral specifications (Gherkin scenarios) and structural analyses derived from Moment specifications. Derivation is AI-assisted for Gherkin generation — completion assurance applies to AI output.

- Schema governance reports (@mmmnt/schema) — structural diff reports, migration plans, and compatibility assessments. AI-assisted analysis with structured output.

- DynamoDB projections (Cloud only) — MomentSpecificationView, FlowView, ParticipantView, TimingConstraintView. Standard projection pattern shared with all Complai products.

## Inherited Decisions

The following decisions from PADR-001 are adopted by Moment without modification:

- Sentinel token requirement — all Moment generation prompts (Gherkin derivation, schema governance analysis, specification summaries) must require \<!-- END_DOCUMENT --> for prose outputs or "completionToken": "COMPLETE" for JSON outputs

- Section manifest contract — multi-section generated outputs (e.g., Gherkin feature files with multiple scenarios) emit a scenario manifest before generating individual scenarios; output is complete only when all manifested scenarios are present

- Read-back verification — all DynamoDB projection writes (Cloud) and filesystem writes (CLI) are followed by structural fingerprint read-back

- Content fingerprinting — fingerprints computed before write, verified after read-back, stored in DynamoDB item metadata (Cloud) or .moment/.assurance/ directory (CLI)

- Idempotent write operations — all projection writes use upsert pattern; partial updates prohibited

- Conflict resolution protocol — read before retry on any conditional check failure; blind retry prohibited

- Operation log — all write operations logged before and after execution

- Structural schema validation — all generated artifacts validated against their schema before persistence

- Completeness score — score gate before artifact finalization

- Diff-based update verification — diff assertion on all updates to detect unexpected mutations

## Moment-Specific Adaptations

### Dual Deployment — CLI vs Cloud Assurance

CLI assurance: Moment CLI operates on the local filesystem. Write integrity uses filesystem-level verification:

- Write pattern: All generated files (@mmmnt/emit-ts TypeScript projections, @mmmnt/derive Gherkin files, @mmmnt/schema reports) are written to a staging directory (.moment/.staging/) first, structurally validated, then moved to the target directory atomically via fs.rename().

- Read-back verification: After atomic move, the CLI reads the target file and computes a structural fingerprint. Fingerprint mismatch triggers a write failure warning (CLI does not retry — it reports and exits with non-zero status).

- Assurance metadata: Fingerprints and operation logs are stored in .moment/.assurance/ (gitignored). This provides local audit trail without polluting the repository.

- No Kafka emission: CLI does not emit events. Completion assurance is local-only. When CLI artifacts sync to Moment Cloud (PADR-003 OQ-2, post-V1), the SyncAnchor aggregate applies Cloud-side assurance to the synced content.

Cloud assurance: Moment Cloud follows the standard PADR-001 pattern — DynamoDB projection writes with fingerprint read-back, Kurrent Cloud event sourcing, and ProjectionWriteCompleted emission to Kafka.

### TypeScript Projection Assurance (@mmmnt/emit-ts)

TypeScript projection is Moment's highest-stakes write surface. A truncated projection silently omits domain concepts that developers then build on — the missing aggregate or value object is discovered during implementation, not at generation time.

Manifest-driven generation: Before generating TypeScript files, @mmmnt/emit-ts queries the Moment specification AST and produces a generation manifest: every bounded context, aggregate, value object, command, event, and policy that should produce a TypeScript artifact. Generation is complete only when every manifested concept has a corresponding file.

Per-file sentinel: Each generated TypeScript file ends with a comment sentinel: // @mmmnt/emit-ts — generation complete. A file without this sentinel is treated as truncated.

Cross-reference integrity: After generation, @mmmnt/emit-ts validates that all import statements in generated files resolve to generated files. A broken import indicates a missing concept in the generation output.

### Derivation Assurance (@mmmnt/derive)

Gherkin scenario derivation from Moment specifications is AI-assisted. The derivation prompt receives a flow specification (moments, participants, timing constraints) and produces behavioral scenarios.

Scenario manifest: Before generating Gherkin, the derivation engine emits a scenario manifest based on the flow specification — one scenario per moment transition, plus edge cases identified by the AI. Generation is complete when every manifested scenario has a corresponding Gherkin feature.

Per-scenario sentinel: Each Gherkin scenario ends with a # @mmmnt/derive — scenario complete comment.

### Document Schema Registry

Moment owns and maintains schema definitions for:

- Moment Specification AST — the parsed representation of .moment files

- TypeScript Projection Manifest — list of domain concepts and their target file paths

- Gherkin Derivation Manifest — list of scenarios and their flow origins

- Schema Governance Report — diff summary, migration steps, compatibility assessment

### Chunking Strategy for Moment Document Types

| Document Type            | Chunking Strategy                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript Projection    | By bounded context. Each context's types are generated independently. Final assembly validates all manifested concepts across all contexts. |
| Gherkin Derivation       | By flow. Each flow's scenarios are derived independently. Assembly validates all manifested scenarios.                                      |
| Schema Governance Report | Single document — schema reports are small enough for single-shot generation with sentinel.                                                 |

### ProjectionWriteCompleted Event — Moment Specifics

Per PADR-001's canonical event schema, Moment Cloud emits ProjectionWriteCompleted events with the following product-specific values:

- productSource: "moment"

- projectionType values: "moment_specification", "typescript_projection", "gherkin_derivation", "schema_governance_report", "flow_view", "participant_view"

- contentReference strategy: "event_stream_position" — Moment Cloud aggregates are event-sourced in Kurrent Cloud. The Kurrent stream position is the canonical content reference.

- Kafka topic: complai.moment.assurance.completion-events

### Implementation Surface

- @mmmnt/core (Layer 1): Parse completeness validation, AST structural integrity checks

- @mmmnt/emit-ts (Layer 1 + Layer 4): TypeScript projection manifest, per-file sentinels, cross-reference integrity, completeness score

- @mmmnt/derive (Layer 1 + Layer 4): Gherkin derivation manifest, per-scenario sentinels, AI generation sentinels

- @mmmnt/schema (Layer 1): Schema governance report generation with sentinel

- Moment Cloud projection service (Layer 2 + Layer 3): DynamoDB write integrity, conditional check conflict resolution, operation log

The shared platform library (@complai/assurance) is consumed by Moment Cloud. The CLI uses a lightweight local implementation (@mmmnt/assurance-local) that provides the same fingerprinting and operation log capabilities against the filesystem instead of DynamoDB.

## Consequences

Positive:

- TypeScript projections are manifest-verified — every domain concept in the specification produces a corresponding file. Missing files are caught at generation time, not during implementation.

- Dual-deployment assurance ensures both CLI and Cloud paths produce verified artifacts, even though their write surfaces differ fundamentally.

- Per-file sentinels in TypeScript projections catch AI truncation at the individual file level, enabling targeted regeneration of the truncated file rather than full re-projection.

Negative:

- The CLI staging directory (.moment/.staging/) adds a temporary disk space requirement equal to the full projection output. Mitigated by: projections are small (typically <1MB total for a domain specification).

- Two assurance implementations (Cloud via @complai/assurance, CLI via @mmmnt/assurance-local) must be maintained in parallel. Mitigated by: the local implementation is intentionally simpler (no DynamoDB, no Kafka) and shares fingerprinting logic via a shared utility package.

## Compliance Notes

Moment Cloud's ProjectionWriteCompleted events provide SOC 2 CC8.1 evidence for specification artifact integrity. CLI assurance metadata (.moment/.assurance/) provides local audit trail for developers operating outside the Cloud platform — relevant for Moment's open-source users who may need to demonstrate specification governance to their own auditors.

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                             |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-03-15 | Initial publication. Binds PADR-001 v1.3 to Moment. Establishes dual-deployment assurance (CLI filesystem + Cloud DynamoDB/Kurrent), TypeScript projection manifest with per-file sentinels, Gherkin derivation manifest with per-scenario sentinels, and ProjectionWriteCompleted event specifics. |

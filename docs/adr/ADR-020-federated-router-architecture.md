# ADR-020: Federated Router Architecture — Moment

Migrated from Confluence page 21594455 (version 1, last updated 2026-03-16), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/21594455. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.0
- **Date:** 2026-03-15
- **Parent ADR:** PADR-003: Federated Router Architecture
- **Parent Version:** 1.4

## Context

Moment exists in two deployment contexts — Moment CLI (local developer tool) and Moment Cloud (cloud subgraph). Only Moment Cloud participates in the federated supergraph. PADR-003 §6 defines the Moment Cloud subgraph architecture including its read-write nature, Kafka emission over private VPC, and the CLI-to-Cloud sync protocol design (post-V1).

Moment Cloud's subgraph is distinctive in the supergraph because it is a read-write subgraph — it accepts the same DSL operations that the CLI provides (parse, validate, derive, generate, viz) exposed as GraphQL mutations. This is not a query-only projection surface. Moment Cloud processes Moment DSL input, produces domain events, and materializes specification projections — all within the request path of a GraphQL mutation.

## Inherited Decisions

The following decisions from PADR-003 are adopted by Moment without modification:

- Subgraph registration in WunderGraph schema registry — Moment Cloud's subgraph schema is versioned and composed into the supergraph

- Persisted operations — all Moment Cloud client queries and mutations are registered at build time

- Authentication via authorizer hook — Moment Cloud trusts X-Complai-Session; never validates JWTs

- OTEL propagation — Moment Cloud resolvers propagate trace context through to Kurrent writes and DynamoDB reads

- Kafka topic naming convention — complai.moment.{context}.{event-category}

- EDFS subscription model — Moment Cloud declares Kafka topics for real-time client updates

- Kafka never exposed to public ingress — Moment Cloud subgraph Lambdas produce to Kafka over private VPC

## Moment-Specific Adaptations

### Subgraph Schema

Moment Cloud's subgraph exposes:

```
# Moment Cloud Subgraph Schema (simplified)

type Query {
  momentSpecification(specificationId: String!): MomentSpecification
  flows(specificationId: String!): [Flow!]!
  participants(flowId: String!): [Participant!]!
  timingConstraints(flowId: String!): [TimingConstraint!]!
  derivationResult(specificationId: String!, derivationType: DerivationType!): DerivationResult
}

type Mutation {
  parseSpecification(input: MomentDSLInput!): ParseResult!
  validateSpecification(specificationId: String!): ValidationResult!
  deriveFromSpecification(specificationId: String!, derivationType: DerivationType!): DerivationJob!
  generateFromSpecification(specificationId: String!, generationType: GenerationType!): GenerationJob!
  vizSpecification(specificationId: String!, vizType: VizType!): VizResult!
  importFromSift(siftSpecificationId: String!): ImportResult!
}

type Subscription {
  specificationEvolution(specificationId: String!): SpecificationUpdate!
  derivationProgress(jobId: String!): DerivationProgressUpdate!
}
```

Read-write semantics: Unlike most product subgraphs which expose projections (read-only views) and lightweight mutations, Moment Cloud's mutations trigger full DSL processing pipelines. A parseSpecification mutation receives raw Moment DSL text, runs the Langium parser, produces an AST, emits parse events to Kurrent, and returns the structured parse result — all within a single GraphQL request. This makes Moment Cloud's mutation resolvers the most computationally intensive in the supergraph.

Entity references: Moment Cloud's MomentSpecification type is a federation entity (annotated with @key(fields: "specificationId")). Sift references Moment specifications by specificationId when displaying specification details alongside domain specifications. The importFromSift mutation accepts a Sift specification ID and creates a Moment specification from it (per Design Principle #16 — Sift as one optional input path).

### Session Context Usage

Moment Cloud reads from X-Complai-Session:

- workspaceId — determines which workspace's specification repository is accessed. Moment specifications are workspace-scoped.

- sessionId — stamped onto all events emitted during DSL processing. Ties specification changes to the authenticated user.

- activeProductScopes — must include "moment" for mutations to proceed. Query-only access may be permitted for broader scopes (e.g., a Sift-only user can view Moment specifications but not modify them).

### EDFS Subscriptions

specificationEvolution: Subscribes to Kafka topic complai.moment.specification.dsl-events. Streams specification changes (parse results, validation outcomes, derivation completions) to the client in real-time. The architect sees specification evolution as it happens during collaborative editing sessions.

derivationProgress: Subscribes to Kafka topic complai.moment.derivation.progress-events. Streams per-scenario Gherkin derivation results as they complete. Similar to Proof's evaluationProgress subscription — the user sees progress without polling.

### Kafka Topics

| Topic                                      | Events                                                    | Trigger                                                                                        |
| ------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| complai.moment.specification.dsl-events    | MomentParsed, MomentValidated, SpecificationImported      | DSL operations via mutations                                                                   |
| complai.moment.derivation.progress-events  | DerivationStarted, ScenarioDerived, DerivationCompleted   | Gherkin derivation pipeline                                                                    |
| complai.moment.generation.lifecycle-events | GenerationStarted, ArtifactGenerated, GenerationCompleted | TypeScript/schema generation                                                                   |
| complai.moment.assurance.completion-events | ProjectionWriteCompleted                                  | PADR-001 completion assurance (see Moment [ADR-018](ADR-018-completion-assurance-pipeline.md)) |

### CLI-to-Cloud Sync (Post-V1)

PADR-003 OQ-2 defines the sync protocol design — event replay with causation rebinding via SyncAnchor aggregate. This ADR notes the following Moment-specific constraints for sync implementation:

- The sync mutation (moment sync push) goes through the federated router → Moment Cloud subgraph. It is a standard authenticated GraphQL mutation.

- Synced events carry syncOrigin: "cli" in their payload, enabling downstream consumers (Proof, Glean) to distinguish CLI-authored from Cloud-authored specifications.

- SyncAnchor aggregate lives in Moment Cloud's Kurrent stream, not a platform-level stream. Sync is a Moment-internal concern.

## Consequences

Positive:

- Moment DSL operations are accessible through the unified supergraph alongside all other product queries. A client application can query a Sift domain specification and a Moment temporal specification in a single federated request.

- Read-write subgraph enables full cloud-hosted specification authoring without CLI installation — lowering the barrier for team collaboration.

- EDFS subscriptions provide real-time specification evolution feedback, matching the interactive experience of the CLI in a cloud environment.

Negative:

- Moment Cloud's mutation resolvers are computationally intensive (Langium parsing, AST construction, event emission). This may require higher Lambda memory allocation or longer timeout configuration compared to query-only subgraphs. Mitigated by: DSL processing is bounded by specification size — a typical domain specification parses in under 2 seconds.

- The importFromSift mutation creates a cross-product dependency at the subgraph level (Moment Cloud must know how to interpret Sift specification events). Mitigated by: the SiftSpecificationImporter in @mmmnt/core encapsulates this translation — the subgraph resolver delegates to the importer, not to direct Sift event deserialization.

## Compliance Notes

Moment Cloud's subgraph participation in the federated supergraph ensures all specification operations are subject to the same authentication, authorization, and audit controls as every other product. Persisted operations prevent arbitrary DSL injection through the GraphQL API. Session attribution on all specification events provides SOC 2 CC6.1 traceability.

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                       |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-03-15 | Initial publication. Binds PADR-003 v1.4 to Moment. Establishes Moment Cloud subgraph schema (read-write DSL operations), session context usage, EDFS subscriptions (specificationEvolution, derivationProgress), Kafka topics, and CLI-to-Cloud sync constraints for post-V1 implementation. |

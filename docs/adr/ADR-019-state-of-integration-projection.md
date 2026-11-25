# ADR-019: State of Integration Projection — Moment

Migrated from Confluence page 21594433 (version 1, last updated 2026-03-16), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/21594433. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.0
- **Date:** 2026-03-15
- **Parent ADR:** PADR-002: State of Integration Projection
- **Parent Version:** 1.3

## Context

Moment participates in the State of Integration (SoI) projection as the Moment Cloud module node. Moment CLI is not represented as a separate node — it operates locally with no runtime integration lines to other products. Only Moment Cloud, which participates in the federated supergraph and emits events to Kafka, has integration edges.

PADR-002 v1.3 defines the following Moment-owned or Moment-targeted edges:

| Edge | From         | To           | Contract                          |
| ---- | ------------ | ------------ | --------------------------------- |
| E-12 | Moment Cloud | Platform     | Subgraph registered in supergraph |
| E-13 | Moment Cloud | Platform     | @complai/events envelope adopted  |
| E-17 | Glean        | Moment Cloud | Consumes Moment event stream      |

Moment Cloud is also an implicit target of any future Proof evaluation edges (Proof evaluating Moment projections), Trace GraphNodeModified consumption, and CascadeRequired distribution — these edges are defined at the platform level (E-26, E-27) and apply to all products.

## Inherited Decisions

The following decisions from PADR-002 are adopted by Moment without modification:

- Red/Blue/Green status semantics — edge statuses derived from runtime verification signals, not manual entry

- Module status derivation — Moment Cloud's module status is the worst of its edge statuses

- Scheduled polling cadence — 5-minute default, 1-minute in development

- Status change alerting — IntegrationEdgeStatusChanged events emitted on color transitions

## Moment-Specific Adaptations

### Edge Verification Signals

E-12 — Moment Cloud ↔ Platform (Subgraph Registration):

Moment Cloud's subgraph exposes Moment DSL operations (parse, validate, derive, generate, viz) as GraphQL mutations and specification projections as queries. The verification signal is standard: WunderGraph schema registry composition check passes with Moment Cloud's subgraph schema present.

E-13 — Moment Cloud ↔ Platform (Event Envelope Adoption):

Moment Cloud emits events to Kafka topics complai.moment.specification.dsl-events and complai.moment.assurance.completion-events. The projection updater samples recent events and validates against the ComplaiEventEnvelope Zod schema. Green requires all sampled events to pass.

E-17 — Glean → Moment Cloud (Event Stream Consumption):

Glean subscribes to Moment Cloud's event stream. This edge is owned by Glean (Glean initiates the dependency), but its health is visible on the Moment Cloud module node. A red E-17 means Glean is not consuming Moment events — learning from Moment specifications is unavailable.

### CLI Exclusion from SoI

Moment CLI operates locally with no network dependencies. It does not participate in the SoI projection because:

- It has no subgraph registration (no federation participation)

- It does not emit events to Kafka (local JSONL only)

- It has no Kafka consumer groups

- Its health is not observable from the platform's runtime signals

When CLI-to-Cloud sync (PADR-003 OQ-2) is implemented post-V1, a new edge (Moment CLI → Moment Cloud, sync protocol health) may be added to the SoI projection.

### Integration Stories in Jira

Moment's integration-tagged stories in the MMNT Jira project carry the integration label:

| Jira Story Scope                                        | Edge |
| ------------------------------------------------------- | ---- |
| Moment Cloud subgraph schema registration               | E-12 |
| @complai/events adoption in Moment Cloud event emission | E-13 |

## Consequences

Positive:

- Moment Cloud's integration health is visible in the SoI projection alongside all other products. Stakeholders can see whether the specification language cloud service is connected to the platform.

- The CLI exclusion is architecturally correct — including a local tool in a runtime integration projection would create false signals.

Negative:

- Moment has fewer integration edges (2 owned) than most products, making its module status less informative. Mitigated by: this accurately reflects Moment Cloud's simpler integration surface — it is primarily a subgraph with event emission, not a cross-product consumer like Proof.

## Compliance Notes

Moment Cloud's integration state provides evidence that the open-source specification language's cloud counterpart is operationally connected to the platform. This matters for customers who use both Moment CLI (local) and Moment Cloud (team collaboration) — the SoI projection confirms the cloud service is healthy.

## Version History

| Version | Date       | Changes                                                                                                                                                                      |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-03-15 | Initial publication. Binds PADR-002 v1.3 to Moment. Establishes Moment Cloud edge verification signals (E-12, E-13), CLI exclusion rationale, and integration story mapping. |

# ADR-028: Sift Import Bootstrap — JSONL Event Stream Architecture

Migrated from Confluence page 47742977 (version 1, last updated 2026-04-02), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/47742977. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Version:** 1.0
- **Date:** 2026-04-02
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/sync, @mmmnt/cli, @mmmnt/core
- **Relates to:** [ADR-017](ADR-017-sift-to-moment-import-translation.md) (Sift-to-Moment Import Translation), [ADR-021](ADR-021-event-payload-contract.md) (Event Payload Contract), [ADR-022](ADR-022-cascade-execution-architecture.md) (Cascade Execution Architecture)
- **Depends On:** SIFT-1 (Sift temporal event schema definitions) — Phase 2 only

## Context

[ADR-017](ADR-017-sift-to-moment-import-translation.md) established that moment import --from-sift translates Sift's Published Language into .moment files via the SiftSpecificationImporter domain service. [ADR-022](ADR-022-cascade-execution-architecture.md) established upstream fingerprint tracking and the .domain/ directory as the location where Sift output is materialized locally.

Neither ADR specified the file format of the Sift Published Language on disk. During development, a single JSON file (SiftImportInput shape) was used as a prototype. This ADR replaces that prototype with the production format: JSONL event files conforming to the ComplaiEventEnvelope structure ([ADR-021](ADR-021-event-payload-contract.md)).

### Why JSONL, not JSON

- Event sourcing alignment. Sift produces domain events (BoundedContextDefined, AggregateAdded, etc.). The natural on-disk representation is one event per line — the same ComplaiEventEnvelope structure used by Kafka and local CLI events.

- Memory efficiency. One JSONL file per bounded context. Large specifications don't require loading the entire domain model into memory at once. Lower-spec machines can process one context at a time without exhausting memory or swap.

- Kafka parity. When Kafka is deployed, replaying a Kafka topic to disk produces JSONL files natively. No format translation required between the event stream and the file system.

- Incremental updates. New events can be appended to a JSONL file without rewriting the entire file. This supports incremental sync from the event stream.

## Decision

### 1. Source Format: JSONL Event Files in .domain/

Each bounded context's Sift output is stored as a JSONL file:

```
.domain/
  ordering.jsonl
  fulfillment.jsonl
  billing.jsonl
```

Each line is a JSON-serialized ComplaiEventEnvelope (per [ADR-021](ADR-021-event-payload-contract.md)) with productSource: "sift":

```
{"eventId":"evt-001","eventType":"BoundedContextDefined","version":1,"productSource":"sift","sessionId":"ses_system_sift_analysis","causationEventIds":[],"correlationId":"corr-spec-001","timestamp":"2026-04-01T10:00:00.000Z","payload":{"contextName":"Ordering","classification":"Core"}}
{"eventId":"evt-002","eventType":"AggregateAdded","version":1,"productSource":"sift","sessionId":"ses_system_sift_analysis","causationEventIds":["evt-001"],"correlationId":"corr-spec-001","timestamp":"2026-04-01T10:00:01.000Z","payload":{"contextName":"Ordering","aggregateName":"Order","identityField":{"name":"orderId","type":"UUID"}}}
```

### 2. Sift Published Language Event Types (Phase 1 — Building Blocks)

| eventType             | Payload Schema                                                                                                                                                                                       | Scope                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| BoundedContextDefined | { contextName: string, classification?: "Core" \\                                                                                                                                                    | "Supporting" \\                           | "Generic" } | File-level container |
| AggregateAdded        | { contextName: string, aggregateName: string, identityField: { name: string, type: string } }                                                                                                        | Nested in context                         |
| CommandDefined        | { contextName: string, aggregateName: string, commandName: string, inputs: Array<{ name: string, type: string }>, emitsEvent: string, preconditions?: Array<{ name: string, description: string }> } | Nested in aggregate                       |
| EventDefined          | { contextName: string, aggregateName: string, eventName: string, fields: Array<{ name: string, type: string, deprecated?: { reason: string, replacement: string } }> }                               | Nested in aggregate                       |
| ValueObjectDefined    | { contextName: string, aggregateName: string, voName: string, fields: Array<{ name: string, type: string }> }                                                                                        | Nested in aggregate                       |
| InvariantDefined      | { contextName: string, invariantId: string, description: string, scope: string }                                                                                                                     | Context-level, scope references aggregate |
| PolicyDefined         | { contextName: string, policyName: string, trigger: string, action: string, chainsTo?: string }                                                                                                      | Context-level                             |
| SagaDefined           | { contextName: string, sagaName: string, trigger: string, states: string[], compensation: string, timeout: string }                                                                                  | Context-level                             |

Phase 2 (Event Storming timeline events) is deferred until SIFT-1 resolves. [ADR-017](ADR-017-sift-to-moment-import-translation.md)'s Phase 2 mapping table governs those event types when available.

### 3. Event Replay — SiftEventStreamReader

A new service SiftEventStreamReader in @mmmnt/sync reads .domain/\*.jsonl files and replays events into the SiftImportInput shape that SiftSpecificationImporter already consumes:

- Reads all .jsonl files in .domain/

- For each file, reads line-by-line (streaming, not bulk load)

- Validates each line is a valid ComplaiEventEnvelope with productSource: "sift"

- Dispatches each event by eventType to an accumulator

- Returns a fully populated SiftImportInput

The reader is transport-agnostic. Today it reads from files. When Kafka deploys, a KafkaSiftConsumer can produce the same event sequence — the accumulator logic is shared.

### 4. Two Bootstrap Paths

Path A — File-based (default, no account required):

Sift pushes domain spec to git → developer pulls → .domain/\*.jsonl on disk → moment import --from-sift reads from disk → produces .moment/ files.

Path B — Kafka replay (future, requires Complai account):

Developer runs moment import --from-sift --from-stream → authenticates → connects to Kafka → replays full event history → accumulates state → produces .moment/ files. This is the registration funnel for first-time bootstrap without .domain/ on disk.

Path B does not block Moment from working. Moment's core pipeline (parse → derive → generate → emit-ts) operates on .moment files regardless of origin. Path B is an onboarding convenience for paid-tier users.

### 5. Upstream Fingerprint

Per [ADR-022](ADR-022-cascade-execution-architecture.md), after import, .moment/.upstream-fingerprint.json is written:

```
{
  "sift": {
    "specificationId": "ordering-service",
    "contentHash": "sha256:...",
    "importedAt": "2026-04-02T10:00:00.000Z",
    "boundedContextCount": 3,
    "aggregateCount": 7,
    "domainEventCount": 21
  }
}
```

The fingerprint is only updated when contentHash changes (true idempotence).

### 6. JSON Prototype Retirement

The single-file JSON prototype format (SiftImportInput shape as one JSON object) is retired. All import paths now use JSONL event files. The SiftImportInput type remains as an internal accumulation target — the reader builds it from events — but it is no longer a file format.

## Consequences

### What becomes easier

- Moment's import path matches the production event stream format from day one. No format migration when Kafka deploys.

- Per-context JSONL files keep memory usage bounded regardless of specification size.

- The ComplaiEventEnvelope structure provides causation chains, correlation IDs, and session identity on every event — enabling audit, debugging, and replay.

- SiftEventStreamReader's accumulator logic is reusable for both file-based and Kafka-based import.

### What becomes harder

- Fixture files for testing are more verbose (JSONL with full envelope per line vs compact JSON).

- Developers inspecting .domain/ see event streams, not a human-readable domain model. Mitigated: .moment/ files (the import output) are the human-readable representation.

- Converting existing JSON prototype fixtures to JSONL requires one-time migration.

### What to watch

- SIFT-1 resolution — Phase 2 temporal event types will add new eventType values to the schema. The reader's dispatcher must be extended.

- Kafka topic partitioning — if Sift partitions by bounded context (one partition per context), the per-context JSONL file convention aligns naturally. If Sift uses a different partitioning strategy, the file layout may need adjustment.

- Event ordering guarantees — the reader currently assumes events within a single JSONL file are in causal order. If Kafka replay produces events out of order, the accumulator needs idempotent/commutative merge logic.

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                      |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-02 | Initial publication. Establishes JSONL event file format for Sift Published Language in .domain/, defines 8 Phase 1 event type payload schemas, introduces SiftEventStreamReader service, retires JSON prototype format, documents two bootstrap paths (file-based and future Kafka replay). |

# ADR-027: Unified .moment File — Spatial + Temporal Coexistence

Migrated from Confluence page 44498947 (version 1, last updated 2026-03-31), https://winnovation.atlassian.net/wiki/spaces/MMMNT/pages/44498947. The Confluence space is private; this file is now the record.

- **Status:** Proposed
- **Date:** 2026-03-31
- **Author:** Claude (AI agent session)
- **Scope:** @mmmnt/core (grammar, parser, IR), @mmmnt/cli
- **Supersedes:** Grammar Reference V1 Section 1 (file separation rule)
- **Relates to:** [ADR-001](ADR-001-event-manifest-moment-dsl-visualization-pipeline.md) (Event Manifest & DSL), [ADR-017](ADR-017-sift-to-moment-import-translation.md) (Sift Import)

## Context

The Moment DSL grammar currently enforces a strict either/or rule at the file level:

```
entry MomentFile:
    (context=ContextDeclaration | flow=FlowDeclaration);
```

This means a .moment file can contain either a bounded context (spatial) or a flow (temporal), never both. The Grammar Reference V1 codified this as a directory convention: .moment/contexts/ for spatial, .moment/flows/ for temporal.

### Problem

This separation forces customers to mentally split their domain model across two files in two directories. When modeling an ordering domain, the customer must:

- Define the Order aggregate, commands, and events in contexts/ordering.moment

- Define what happens when an order is placed in flows/order-placed.moment

- Maintain referential integrity between the two files by name

This dilutes Moment's core value proposition. The product should let a customer describe their domain in one cohesive file — what exists (spatial) and what happens (temporal) — without requiring them to understand an internal file organization convention.

### Langium Capability

This is not a platform limitation. Langium supports multiple top-level declarations in a single grammar entry rule. The restriction is a design choice in moment.langium, not a tooling constraint.

## Decision

### 1. Grammar Change

The entry rule changes from either/or to allow both:

```
entry MomentFile:
    contexts+=ContextDeclaration*
    flows+=FlowDeclaration*;
```

A .moment file can now contain:

- Zero or more context declarations (spatial)

- Zero or more flow declarations (temporal)

- Both in the same file

### 2. Backward Compatibility

Existing files continue to parse without changes:

- A file with only a context declaration still works

- A file with only a flow declaration still works

- The contexts/ and flows/ directory convention is preserved but optional

### 3. Unified File Convention

Customers may author a single file per domain area:

```
context "Ordering" [Core]

  aggregate "Order"
    identity orderId: UUID

    command PlaceOrder
      input customerId: UUID, items: OrderItem[]
      emits OrderPlaced

    event OrderPlaced
      orderId: UUID
      customerId: UUID
      items: OrderItem[]
      placedAt: DateTime

  value-object OrderItem
    productId: UUID
    quantity: number
    unitPrice: Money

flow "order-placed"
  description "Order submission triggers fulfillment"

  lane ordering "Ordering" [Core]
  lane fulfillment "Fulfillment" [Supporting]

  frame "Order submission"
    ordering: PlaceOrder
    ordering: OrderPlaced crosses-to fulfillment via CustomerSupplier
      contract
        orderId: UUID [required]
        items: OrderItem[] [required]
```

### 4. IR Changes

The astToIr function currently expects a single context or flow. It must be updated to:

- Collect all context declarations into the IR's context list

- Collect all flow declarations into the IR's flow list

- Support name resolution across contexts and flows in the same file

### 5. Parser Result Changes

MomentParser.parseContent() returns an IR that may contain both contexts and flows. The MomentIR interface already supports this (it has both contexts and flows arrays). The change is in the AST-to-IR mapping, not the IR shape.

### 6. CLI Impact

CLI commands operate on the IR, not the AST. Since the IR already has contexts[] and flows[], most commands need no changes:

- parse: Reports context count AND flow count

- derive: Derives from flows in the IR (unchanged)

- generate: Generates from both contexts and flows (unchanged)

- emit-ts: Emits from contexts (unchanged)

- sync status: Compares expected vs actual (unchanged)

### 7. Manifest Update

The manifest schema should support a flat file list in addition to the categorized convention:

```
# Existing (still supported)
contexts:
  - name: "Ordering"
    path: "contexts/ordering.moment"
flows:
  - name: "order-placed"
    path: "flows/order-placed.moment"

# New: unified files
files:
  - path: "ordering.moment"
    contexts: ["Ordering"]
    flows: ["order-placed"]
```

### 8. Import Update (ADR-017)

The Sift import translator may continue producing separate files (separation is fine for machine-generated output). The change is that hand-authored files are no longer constrained.

## Consequences

### What becomes easier

- Customer authors one file per domain area — spatial and temporal together

- No directory convention to learn before modeling

- Name resolution is local to the file (context and flow in same scope)

- Onboarding: "create a .moment file and describe your domain"

### What becomes harder

- Parser must handle mixed content (contexts + flows in one AST)

- Tooling (IDE, syntax highlighting) must support both blocks in one file

- Large domains may produce large files (mitigated by allowing split files)

### What stays the same

- Separate files still work (backward compatible)

- IR shape unchanged (already has contexts[] + flows[])

- All CLI commands operate on IR, not file structure

## Alternatives Considered

### 1. Keep strict separation (rejected)

Status quo. Rejected: dilutes CVP, forces directory convention on customers, splits mental model.

### 2. Include directive (rejected)

Add include "contexts/ordering.moment" to flow files. Rejected: adds complexity, still requires multiple files, introduces a build step.

### 3. Inline flow blocks inside context (rejected)

Allow flow as a context member alongside aggregates. Rejected: flows are cross-context by nature — they reference multiple contexts. Nesting inside one context is semantically wrong.

## Cascade Impact

| ADR                                                                   | Impact                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Grammar Reference V1                                                  | Section 1 amended: files may contain both                    |
| [ADR-017](ADR-017-sift-to-moment-import-translation.md)               | Import may still produce separate files (no change required) |
| [ADR-024](ADR-024-git-artifact-retrieval-trees-api-semantic-index.md) | ArtifactIndexEntry must handle unified files                 |

## Version History

| Version | Date       | Changes          |
| ------- | ---------- | ---------------- |
| 0.1     | 2026-03-31 | Initial proposal |

# ADR-037: Grammar Model Completeness: projections, queries, rules, terms, external systems

Rebuilt on 2026-11-24 from PR #181, the 0.6.0 release notes and the code; the original ADR document did not survive.

- **Status:** Accepted. The old wiki ADR index lists it as Accepted. No ruling text survives.
- **Date:** 2026-10-24, as the old wiki ADR index gives it.
- **Landed in:** e5b7fc1 (#181), merged 2026-10-29. Released in the `@mmmnt/*` 0.6.0 group.
- **Superseded in part by:** [ADR-038](ADR-038-palette-conformance.md) section 1. ADR-038 removed the condition-triggered policies of section 7 and made `chains-to` required.
- **Section numbers:** the section numbers below are the ones the commits of #181 and the code comments cite (`ADR-037 §1` to `§8`). The headings are taken from those commit subjects. The original wording of each section is lost.

## What this record can and cannot say

The decision text is gone. What survives is what the change did: the commits of #181, the changeset, the 0.6.0 changelog entry of `@mmmnt/core`, the summary in the old wiki ADR index, and the code that cites this ADR. This file states that. It does not restate context, alternatives or rationale that no source records.

## Summary (old wiki ADR index)

Extends the grammar with projections (sources, description, fields), queries, context-level rules with a declared or external enforcer, value objects at the context level, per-context glossary terms, and external systems as relationship ends and `External` lanes. Flow nodes resolve to projection and query kinds. Code generation emits read-model types for context value objects, projections and queries. The specification document renders projections, queries, rules, terms and externals. The context map draws externals. Model completeness rules V22 to V28 check the new constructs.

## Decision, as built

### §1. Projections

A context may declare a projection with the events it reads, an optional description, fields and gateways (gateways came with [ADR-038](ADR-038-palette-conformance.md) section 4). Grammar at e5b7fc1:

```langium
ProjectionDeclaration:
    'projection' name=ID
        'sources' sources+=ID (',' sources+=ID)*
        ('description' description=STRING)?
        ('field' fields+=FieldDeclaration)*
        gateways+=GatewayDeclaration*;
```

A flow node may name a projection and resolves to the projection kind.

### §2. Queries

A context may declare a query with what it reads, optional inputs and an optional description:

```langium
QueryDeclaration:
    'query' name=ID
        'reads' reads+=ID (',' reads+=ID)*
        ('input' inputs+=InputField (',' inputs+=InputField)*)?
        ('description' description=STRING)?;
```

A flow node may name a query and resolves to the query kind. The new words became keywords, so field and input names were made keyword-safe: a comma-separated input list may use any of `projection`, `query`, `rule` and `term` as a name.

### §3. Rules outside an aggregate

A context may declare a rule that is enforced by a declared service or query, or by an external enforcer given as text:

```langium
RuleDeclaration:
    'rule' id=ID description=STRING
        'enforced-by' (enforcer=ID | enforcerText=STRING);
```

### §4. Value objects at the context level

A context may declare value objects outside every aggregate. `emit-ts` emits read-model types for them.

### §5. Glossary terms

A context may declare glossary terms. They fill the IR glossary.

```langium
TermDeclaration:
    'term' term=STRING definition=STRING;
```

### §6. External systems

An external system is not modelled. It may be a relationship end or a lane classified `External`. The context map draws externals after the contexts, so a relationship to one keeps its edge.

```langium
ExternalDeclaration:
    'external' name=ID description=STRING
        gateways+=GatewayDeclaration*;
```

### §7. Policies triggered by a condition

This section added policies triggered by a condition, with the trigger's kind. The changelog names the `condition` and `"file-watcher"` triggers. [ADR-038](ADR-038-palette-conformance.md) removed both before release, and made `chains-to` required. No condition-triggered policy shipped in 0.6.0. (A policy condition on the trigger event's field came later, in [ADR-045](ADR-045-a-policy-declares-the-condition-under-which-it-reacts.md).)

### §8. A model directory is one project

`moment parse` takes a directory. Every read-only command takes a directory and loads every `.moment` file beneath it as one merged project. The project root is found inside that directory. The merge keeps externals, and resolves node kinds and relationship ends across files. Project mode checks that every flow node names a building block of its lane's context, and checks saga transition events across files. [ADR-038](ADR-038-palette-conformance.md) section 5 extends project mode to `serve --project` and `reconcile`. The 0.6.0 changelog lists all of project mode under ADR-038; the code cites this section for the read-only commands.

### Outputs

- `emit-ts` emits read-model types for context value objects, projections and queries.
- The specification document renders projections, queries, rules, terms and externals.
- The context map draws externals and keeps relationships to them.
- Impact analysis knows projections and queries: a projection depends on the events it folds, and a query on the projections it reads.
- Simulation keeps read steps as queries and projections. A read is never simulated as a domain event.

## Validation rules V22 to V28

These checks compare names across declarations, so they run on the IR. Over a single file they are warnings, because a file cannot see its siblings. Over a merged project they are errors. The messages are those in `packages/core/src/validation/model-completeness.ts` at e5b7fc1.

| Rule | Check                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| V22  | A projection's sources are declared events.                                                                       |
| V23  | A query reads declared projections or value objects.                                                              |
| V24  | A rule with a declared enforcer names a service or query of its context.                                          |
| V25  | A value object is declared once per context.                                                                      |
| V26  | A glossary term is defined once per context.                                                                      |
| V27  | A relationship end is a declared context or external, and a lane classified `External` names a declared external. |
| V28  | A service consumes and produces declared events or value objects.                                                 |

V38 and V39 were added to the same module later, in #184 (also released in 0.6.0). They are not part of this ADR.

## Consequences

- Words such as `projection`, `query`, `rule` and `term` are keywords.
- `moment parse <dir>` can fail on a model that previously passed, because V22 to V28 are errors over a merged project.

## Sources

- PR #181 body and its squash commit e5b7fc1 (the commit subjects carry the section numbers).
- `.changeset/adr-037-039.md` and the 0.6.0 entry in `packages/core/CHANGELOG.md`. The 0.6.0 entry in `packages/cli/CHANGELOG.md` records only the dependency bumps.
- The old wiki `ADR-Index.md` at d8da1b8.
- Code at e5b7fc1: `packages/core/src/grammar/moment.langium`, `packages/core/src/validation/model-completeness.ts`, and the comments that cite `ADR-037` in core, derive, generate, emit-ts, viz, mcp and cli.

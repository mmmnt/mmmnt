# ADR-038: Palette Conformance: policies, orchestrations, aggregate state, gateways, project mode for serve and reconcile

Rebuilt on 2026-11-24 from PR #181, the 0.6.0 release notes and the code; the original ADR document did not survive.

- **Status:** Accepted. The old wiki ADR index lists it as Accepted. No ruling text survives.
- **Date:** 2026-10-24, as the old wiki ADR index gives it.
- **Landed in:** e5b7fc1 (#181), merged 2026-10-29. Released in the `@mmmnt/*` 0.6.0 group.
- **Supersedes:** the condition-triggered policies of [ADR-037](ADR-037-grammar-model-completeness.md) section 7.
- **Amended by:** [ADR-040](ADR-040-process-constructs-causes-and-note-moments.md) (section 2 and V31), [ADR-041](ADR-041-commands-record-one-or-more-events.md), [ADR-045](ADR-045-a-policy-declares-the-condition-under-which-it-reacts.md) (section 1) and later ADRs. This file describes the decision as it shipped in 0.6.0.
- **Section numbers:** the section numbers below are the ones the code comments and tests cite (`ADR-038 §1` to `§5`). The original wording of each section is lost.

## What this record can and cannot say

The decision text is gone. What survives is what the change did: the commits of #181, the changeset, the 0.6.0 changelog entry of `@mmmnt/core`, the summary in the old wiki ADR index, and the code that cites this ADR. This file states that. It does not restate context, alternatives or rationale that no source records.

## Summary (old wiki ADR index)

Holds the grammar to the NDD palette. A policy is one domain event and one command (`chains-to` is required). `orchestration` is the palette's Saga (`saga` stays an alias). It is invoked by one of its own commands, issues aggregate and `<External>.<operation>` commands, advances on its own commands relayed by policies, and compensates with named commands or `none`. Aggregates may declare internal `state`. Projections, policies, orchestrations and externals may declare gateways. Palette rules V29 to V37 check this. Project mode: every read-only command, `serve --project`, and `reconcile` load a model directory as one merged project, checking node placement, saga transitions and external lanes across files.

## Decision, as built

### §1. A policy is one domain event and one command

When one domain event, then one command. `chains-to` is required. The `condition` and `"file-watcher"` triggers that [ADR-037](ADR-037-grammar-model-completeness.md) added are removed. Grammar at e5b7fc1:

```langium
PolicyDeclaration:
    'policy' name=ID
        'trigger' trigger=ID
        'action' action=STRING
        'chains-to' chainsTo=ID
        gateways+=GatewayDeclaration*;
```

### §2. An orchestration is the palette's Saga

The keyword is `orchestration`. `saga` stays an alias, and the IR node kind stays `saga`. An orchestration:

- is invoked by one of its own commands (`invoked-by`);
- issues commands to aggregates and to externals, written `<External>.<operation>` (`issues`);
- advances only on its own commands, each invoked by a relay policy on the previous step's event;
- compensates with named commands, or declares `compensation none`;
- generates no domain event of its own.

Relay policies bind each step's event and the orchestration's start event, so derive, generate and the harness follow a run along the event path. A flow may place an orchestration's own commands: project mode counts them as building blocks of its context. Gherkin derives one scenario per named compensation command; `compensation none` has nothing to undo.

```langium
SagaDeclaration:
    keyword=('orchestration' | 'saga') name=ID
        commands+=OrchestrationCommand*
        'invoked-by' invokedBy=ID
        'issues' issues+=IssuedCommand (',' issues+=IssuedCommand)*
        'states' initialState=ID transitions+=SagaTransition*
        compensations+=Compensation+
        'timeout' timeout=SagaTimeout
        gateways+=GatewayDeclaration*;

IssuedCommand:
    target=ID ('.' operation=ID)?;

Compensation:
    'compensation' (none?='none' | 'on' command=ID 'issues' undo+=IssuedCommand (',' undo+=IssuedCommand)*);
```

### §3. Aggregate internal state

An aggregate may declare internal state right after its identity: one initial state, and transitions on the aggregate's own commands. Written first, it cannot be read as an event field named `state`.

```langium
AggregateStateDeclaration:
    'state' (initial?='initial' name=ID | from=ID '->' to=ID 'on' command=ID);
```

### §4. Gateways

A gateway is the palette's Gateway tab: request-to-value logic on the construct that uses it. Projections, orchestrations, policies and externals may declare gateways.

```langium
GatewayDeclaration:
    'gateway' name=ID
        'consumes' consumes=ID
        'produces' produces=ID
        ('description' description=STRING)?;
```

### §5. Project mode for serve and reconcile

`serve --project <dir>` serves a model directory as one merged project. A bare directory stays a facet folder. Serve's live pipeline loads a model directory the same way. `reconcile` loads a model directory as one project and reads its `.domain/`. Project mode for the read-only commands is cited in code as [ADR-037](ADR-037-grammar-model-completeness.md) section 8.

## Validation rules V29 to V37

Like V22 to V28, these are warnings per file and errors over a merged project. Hand-built IR that predates this ADR carries no orchestration fields and is not checked for them. The checks are those in `packages/core/src/validation/palette-conformance.ts` at e5b7fc1.

| Rule | Check                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| V29  | A policy chains to a command of an aggregate or an orchestration.                                                                   |
| V30  | A policy is triggered by a declared domain event.                                                                                   |
| V31  | An orchestration's commands emit no domain event.                                                                                   |
| V32  | An orchestration is invoked by one of its own commands.                                                                             |
| V33  | An orchestration issues commands of an aggregate, or operations of a declared external.                                             |
| V34  | An orchestration step is on one of its own commands, and some policy chains to that command.                                        |
| V35  | `compensation none` stands alone, and a compensation is on one of the orchestration's own commands.                                 |
| V36  | An aggregate declares exactly one initial state, moves only on its own commands, and every state is reachable from the initial one. |
| V37  | A gateway consumes and produces declared events or value objects.                                                                   |

V21 is retired: an orchestration step names a command, which V34 checks.

## Consequences

Breaking for existing models (0.6.0 changelog):

- `chains-to` is required on every policy, and the `condition` and `"file-watcher"` policy triggers are removed. A model using them no longer parses.
- V22 to V37 are warnings for a single file and errors over a merged project, so `moment parse <dir>` can fail on a model that previously passed. Run `moment parse <dir>` after upgrading.

The example corpus was rewritten to these rules (ticketwave's SeatHoldLifecycle and TransferLifecycle, vet-clinic's VisitLifecycle, and the ADR-037 exemplar), and invalid exemplars were added for V29 to V37.

## Sources

- PR #181 body and its squash commit e5b7fc1, in particular the commit "feat(core): hold the grammar to the NDD palette (ADR-038)".
- `.changeset/adr-037-039.md` and the 0.6.0 entry in `packages/core/CHANGELOG.md`. The 0.6.0 entry in `packages/cli/CHANGELOG.md` records only the dependency bumps.
- The old wiki `ADR-Index.md` at d8da1b8.
- Code at e5b7fc1: `packages/core/src/grammar/moment.langium`, `packages/core/src/validation/palette-conformance.ts`, and the comments and tests that cite `ADR-038` in core, generate, derive, cli and mcp.
